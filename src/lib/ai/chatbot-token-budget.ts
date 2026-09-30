/** Shared transport budgets. Character estimates are NOT provider billing counts. */
export const CHATBOT_LIMITS = Object.freeze({
  historyMessages: 10, historyCharacters: 12_000, messageCharacters: 2_000,
  memoryEntries: 6, contextCharacters: 8_000, automaticTopics: 2,
  // Room for full answers; "thinking" models (e.g. DeepSeek v4) spend part of it reasoning first.
  outputTokens: 4_096,
});

export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface ChatbotConversationMemory { topics: string[]; modules: string[] }

export function estimateTokens(text: string): number { return Math.ceil(text.length / 4); }

function clip(text: string): string {
  const value = text.trim().slice(0, CHATBOT_LIMITS.messageCharacters);
  // Do not leave half of a UTF-16 surrogate pair at a character boundary.
  return value.replace(/[\uD800-\uDBFF]$/, "");
}

/** Keep a contiguous suffix of completed turns and preserve a trailing user message. */
export function normalizeChatHistory(history: readonly ChatMessage[]): ChatMessage[] {
  const pairs: ChatMessage[][] = [];
  let user: ChatMessage | undefined;
  for (const message of history) {
    if (!message.content.trim()) continue;
    if (message.role === "user") user = { role: "user", content: clip(message.content) };
    else if (message.role === "assistant" && user) {
      pairs.push([user, { role: "assistant", content: clip(message.content) }]);
      user = undefined;
    }
  }
  const trailingUser = user;
  const kept: ChatMessage[][] = [];
  let characters = 0;
  const reservedMessages = trailingUser ? 1 : 0;
  const reservedCharacters = trailingUser?.content.length ?? 0;
  for (let i = pairs.length - 1; i >= 0; i--) {
    const size = pairs[i].reduce((total, message) => total + message.content.length, 0);
    if ((kept.length + 1) * 2 + reservedMessages > CHATBOT_LIMITS.historyMessages || characters + size + reservedCharacters > CHATBOT_LIMITS.historyCharacters) break;
    kept.unshift(pairs[i]); characters += size;
  }
  return [...kept.flat(), ...(trailingUser ? [trailingUser] : [])];
}

/** Six identifiers TOTAL; entries are identifiers only, never arbitrary summary prose. */
export function normalizeConversationMemory(
  memory: Partial<ChatbotConversationMemory> | undefined,
  allowedTopics: ReadonlySet<string>, allowedModules: ReadonlySet<string>,
): ChatbotConversationMemory {
  const topics = Array.from(new Set(memory?.topics ?? [])).filter(value => allowedTopics.has(value)).slice(0, CHATBOT_LIMITS.memoryEntries);
  const modules = Array.from(new Set(memory?.modules ?? [])).filter(value => allowedModules.has(value)).slice(0, CHATBOT_LIMITS.memoryEntries - topics.length);
  return { topics, modules };
}

export const CONTEXT_OMITTED = "Additional context was omitted to keep this answer concise.";
export const CONTEXT_UNAVAILABLE = "Live data is unavailable; do not infer counts or statuses.";

/** Truncate at a whole line, reserving room for the omission notice. */
export function capChatbotContext(context: string): string {
  if (context.length <= CHATBOT_LIMITS.contextCharacters) return context;
  const budget = CHATBOT_LIMITS.contextCharacters - CONTEXT_OMITTED.length - 1;
  const end = context.lastIndexOf("\n", budget);
  return (end > 0 ? context.slice(0, end) + "\n" : "") + CONTEXT_OMITTED;
}
