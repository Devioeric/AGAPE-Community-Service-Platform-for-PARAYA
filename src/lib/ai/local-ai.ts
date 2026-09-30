export interface LocalAIMessage {
  role:    "system" | "user" | "assistant";
  content: string;
}

interface LocalAIRequest {
  messages:     LocalAIMessage[];
  temperature?: number;
  max_tokens?:  number;
  signal?: AbortSignal;
  response_format?: { type: "json_object" };
}

export function isLocalAIConfigured(): boolean {
  if (process.env.AGAPE_LOCAL_AI_ENABLED === "false") return false;
  return Boolean(process.env.LOCAL_AI_API_KEY && process.env.LOCAL_AI_BASE_URL);
}

function providerBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

export async function callLocalAI({
  messages,
  temperature = 0.7,
  max_tokens  = 1024,
  signal,
  response_format,
}: LocalAIRequest): Promise<string> {
  const baseUrl = process.env.LOCAL_AI_BASE_URL;
  const apiKey  = process.env.LOCAL_AI_API_KEY;
  const model   = process.env.LOCAL_AI_MODEL;

  if (!baseUrl || !apiKey) throw new Error("Local AI is not configured");
  if (!model)              throw new Error("LOCAL_AI_MODEL is not set");

  const res = await fetch(`${providerBaseUrl(baseUrl)}/chat/completions`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens, stream: false, ...(response_format ? { response_format } : {}) }),
    signal,
  });

  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Local AI request failed (${res.status})`);
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Local AI returned no content");
  return content;
}

/** Streaming variant: yields content deltas as the model generates them.
 *  Parses the OpenAI-compatible SSE stream. */
export async function* streamLocalAI({
  messages,
  temperature = 0.7,
  max_tokens  = 1024,
  signal,
}: LocalAIRequest): AsyncIterable<string> {
  const baseUrl = process.env.LOCAL_AI_BASE_URL;
  const apiKey  = process.env.LOCAL_AI_API_KEY;
  const model   = process.env.LOCAL_AI_MODEL;

  if (!baseUrl || !apiKey) throw new Error("Local AI is not configured");
  if (!model)              throw new Error("LOCAL_AI_MODEL is not set");

  const res = await fetch(`${providerBaseUrl(baseUrl)}/chat/completions`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Local AI request failed (${res.status})`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let emitted = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop() ?? "";
      if (buffer.length > 65_536) throw new Error("Invalid provider stream");
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || !line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          if (!emitted) throw new Error("Provider returned no content");
          return;
        }
        let obj: { error?: unknown; choices?: { delta?: { content?: string } }[] };
        try { obj = JSON.parse(payload); } catch { throw new Error("Invalid provider stream"); }
        if (!obj || obj.error) throw new Error("Provider stream failed");
        const delta = obj.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) { emitted = true; yield delta; }
      }
      if (done) throw new Error("Provider stream interrupted");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
