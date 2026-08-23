"use client";

import { useState, useRef, useEffect, useMemo, Fragment } from "react";
import { MessageCircle, X, Send, Loader2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/ai/chatbot";
import { getAvailableModules } from "@/lib/ai/chatbot-modules";

/** Tiny markdown-ish renderer: paragraphs, bullet lists, numbered lists, **bold**, *italic*, `code`.
 *  Scoped to what the chatbot is told to output — not a full markdown impl. */
function renderInline(text: string): React.ReactNode {
  // Order matters: bold before italic (so **x** doesn't get half-parsed as italic), code separate.
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    const token = m[0];
    if (token.startsWith("**"))      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))  parts.push(<code key={key++} className="px-1 py-0.5 rounded bg-surface-alt text-[0.85em] font-mono">{token.slice(1, -1)}</code>);
    else                             parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    lastIdx = m.index + token.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length ? parts : text;
}

function FormattedMessage({ content }: { content: string }) {
  const lines  = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const isBullet = (s: string) => /^\s*[-*]\s+/.test(s);
  const isNumber = (s: string) => /^\s*\d+\.\s+/.test(s);

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-5 my-1 space-y-0.5">
          {items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
        </ul>
      );
      continue;
    }

    if (isNumber(line)) {
      const items: string[] = [];
      while (i < lines.length && isNumber(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal pl-5 my-1 space-y-0.5">
          {items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
        </ol>
      );
      continue;
    }

    // Paragraph: collect consecutive non-list, non-blank lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBullet(lines[i]) && !isNumber(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-1 first:mt-0 last:mb-0">
        {para.map((p, j) => (
          <Fragment key={j}>
            {renderInline(p)}
            {j < para.length - 1 && <br />}
          </Fragment>
        ))}
      </p>
    );
  }

  return <>{blocks}</>;
}

interface Props {
  role: string;
}

export function ChatbotWidget({ role }: Props) {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [module, setModule]       = useState<string>("");  // "" = auto-detect
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const modules                   = useMemo(() => getAvailableModules(role), [role]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages, open]);

  // Don't show chatbot on pages that don't need it (keeps it out of admin-only flows)
  if (role === "admin") return null;

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const historySnapshot = messages;
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chatbot", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message:             text,
          conversationHistory: historySnapshot,
          module:              module || null,
        }),
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role:    "assistant",
            content: j.error ?? "Sorry, I'm having trouble responding right now. Please try again.",
          };
          return next;
        });
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload) as { chunk?: string; error?: string };
            if (obj.error) {
              assistantText = obj.error;
            } else if (obj.chunk) {
              assistantText += obj.chunk;
            }
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: assistantText };
              return next;
            });
          } catch {
            // skip malformed line
          }
        }
      }
    } catch (err) {
      console.error("[chatbot] fetch failed:", err);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role:    "assistant",
          content: "Sorry, the connection dropped. Please try again.",
        };
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 sm:w-96 flex flex-col shadow-2xl rounded-2xl overflow-hidden border border-border bg-surface">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-primary text-white shrink-0">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">AGAPE Assistant</p>
              <p className="text-xs text-white/70">AI-powered platform guide</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[420px] bg-surface-alt/30">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center pt-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">Hi! I&apos;m AGAPE Assistant.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ask me about programs, schedules, volunteer requirements, or how to use the platform.
                </p>
              </div>
            )}

            {messages.map((msg, i) => {
              // Hide empty assistant placeholder — the loading spinner stands in for it
              if (msg.role === "assistant" && msg.content === "") return null;
              return (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-white rounded-br-sm"
                      : "bg-surface border border-border text-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.role === "assistant"
                    ? <FormattedMessage content={msg.content} />
                    : msg.content}
                </div>
              </div>
              );
            })}

            {loading && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content === "" && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mr-2 flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t border-border bg-surface">
            {/* Topic picker */}
            <div className="px-3 pt-2 pb-1 flex items-center gap-2">
              <label htmlFor="chatbot-topic" className="text-[11px] text-muted-foreground shrink-0">Topic</label>
              <select
                id="chatbot-topic"
                value={module}
                onChange={(e) => setModule(e.target.value)}
                disabled={loading}
                className="flex-1 text-xs bg-surface-alt/50 border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 cursor-pointer"
              >
                <option value="">Auto-detect</option>
                {modules.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
              {module && (
                <button
                  type="button"
                  onClick={() => setModule("")}
                  className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  title="Clear topic filter"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Message input */}
            <div className="px-3 pt-1 pb-3 flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={loading}
                placeholder="Ask me anything…"
                className="flex-1 text-sm bg-surface-alt/50 border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground disabled:opacity-50"
              />
              <Button
                size="sm"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="w-9 h-9 p-0 rounded-xl bg-primary hover:bg-primary-light text-white flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* FAB toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-13 h-13 rounded-full bg-primary hover:bg-primary-light text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
        style={{ width: 52, height: 52 }}
        aria-label="Open AGAPE Assistant"
      >
        {open
          ? <X className="w-5 h-5" />
          : <MessageCircle className="w-5 h-5" />}
      </button>
    </>
  );
}
