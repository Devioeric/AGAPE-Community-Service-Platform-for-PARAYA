export interface LocalAIMessage {
  role:    "system" | "user" | "assistant";
  content: string;
}

interface LocalAIRequest {
  messages:     LocalAIMessage[];
  temperature?: number;
  max_tokens?:  number;
}

export function isLocalAIConfigured(): boolean {
  return Boolean(process.env.LOCAL_AI_API_KEY && process.env.LOCAL_AI_BASE_URL);
}

export async function callLocalAI({
  messages,
  temperature = 0.7,
  max_tokens  = 1024,
}: LocalAIRequest): Promise<string> {
  const baseUrl = process.env.LOCAL_AI_BASE_URL;
  const apiKey  = process.env.LOCAL_AI_API_KEY;
  const model   = process.env.LOCAL_AI_MODEL;

  if (!baseUrl || !apiKey) throw new Error("Local AI is not configured");
  if (!model)              throw new Error("LOCAL_AI_MODEL is not set");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens, stream: false }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Local AI request failed (${res.status}): ${text || res.statusText}`);
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
}: LocalAIRequest): AsyncIterable<string> {
  const baseUrl = process.env.LOCAL_AI_BASE_URL;
  const apiKey  = process.env.LOCAL_AI_API_KEY;
  const model   = process.env.LOCAL_AI_MODEL;

  if (!baseUrl || !apiKey) throw new Error("Local AI is not configured");
  if (!model)              throw new Error("LOCAL_AI_MODEL is not set");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens, stream: true }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Local AI request failed (${res.status}): ${text || res.statusText}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || !line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const obj = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // skip malformed line
      }
    }
  }
}
