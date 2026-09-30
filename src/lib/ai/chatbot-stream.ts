const UNAVAILABLE = "The AI assistant is temporarily unavailable. Please try again.";

export type ChatbotNavigationLink = {
  id: string;
  label: string;
  href: string;
  description: string;
  availability: "available" | "check_page";
};

/** Read actual SSE frames, including split UTF-8/code points and CRLF boundaries. */
export async function consumeChatbotStream(
  response: Response,
  onText: (text: string) => void,
  onNavigation?: (links: ChatbotNavigationLink[]) => void,
): Promise<string> {
  if (!response.ok) throw new Error(response.status === 429 ? "The AI assistant is temporarily rate-limited. Please try again." : UNAVAILABLE);
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error(UNAVAILABLE);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let eventLines: string[] = [];
  let completed = false;
  function dispatch() {
    if (!eventLines.length) return;
    const payload = eventLines.join("\n"); eventLines = [];
    if (payload === "[DONE]") { completed = true; return; }
    let event: unknown;
    try { event = JSON.parse(payload); } catch { throw new Error(UNAVAILABLE); }
    if (!event || typeof event !== "object") throw new Error(UNAVAILABLE);
    const value = event as { chunk?: unknown; error?: unknown; navigation?: unknown };
    if (value.error !== undefined) throw new Error(typeof value.error === "string" && value.error.includes("rate-limited")
      ? "The AI assistant is temporarily rate-limited. Please try again." : UNAVAILABLE);
    if (typeof value.chunk !== "string") throw new Error(UNAVAILABLE);
    if (value.navigation !== undefined && onNavigation) {
      if (!Array.isArray(value.navigation) || value.navigation.some((item) => {
        if (!item || typeof item !== "object") return true;
        const link = item as Record<string, unknown>;
        return typeof link.id !== "string" || typeof link.label !== "string" || typeof link.href !== "string" || !link.href.startsWith("/") || typeof link.description !== "string" || typeof link.availability !== "string" || !["available", "check_page"].includes(link.availability);
      })) throw new Error(UNAVAILABLE);
      onNavigation(value.navigation as ChatbotNavigationLink[]);
    }
    answer += value.chunk;
    onText(answer);
  }
  try {
    while (!completed) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, ""); buffer = buffer.slice(newline + 1);
        if (!line) dispatch();
        else if (line.startsWith("data:")) eventLines.push(line.slice(5).replace(/^ /, ""));
        if (completed) break;
      }
      if (buffer.length > 65_536 || answer.length > 100_000) throw new Error(UNAVAILABLE);
      if (done) break;
    }
    if (!completed) throw new Error("The response was interrupted. Please try again.");
    if (!answer.trim()) throw new Error(UNAVAILABLE);
    return answer;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
