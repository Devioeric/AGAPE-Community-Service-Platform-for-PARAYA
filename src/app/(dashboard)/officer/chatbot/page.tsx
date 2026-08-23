"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/ai/chatbot";

const SUGGESTED = [
  "How do I create a new program proposal?",
  "What are the SDG alignment requirements?",
  "How do volunteers log their hours?",
  "What is the approval pipeline for proposals?",
  "How do I distribute donations to barangays?",
];

export default function ChatbotPage() {
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chatbot", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message:             msg,
          conversationHistory: messages,
        }),
      });

      const j = await res.json();
      if (res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: j.reply }]);
      } else {
        setMessages((prev) => [...prev, {
          role:    "assistant",
          content: j.error ?? "Sorry, I'm having trouble responding right now. Please try again.",
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, {
        role:    "assistant",
        content: "Connection error. Please check your network and try again.",
      }]);
    }
    setLoading(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function clearChat() {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 11rem)" }}>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-heading font-semibold text-lg text-foreground">AGAPE Assistant</h2>
            <p className="text-sm text-muted-foreground">AI-powered platform guide · Gemini 2.0 Flash</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="gap-1.5 text-muted-foreground">
            <RotateCcw className="w-3.5 h-3.5" />
            New chat
          </Button>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto bg-surface rounded-xl border border-border shadow-[0_2px_8px_rgba(107,91,62,0.06)] flex flex-col">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-10 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="font-heading font-semibold text-lg text-foreground">Hi! I&apos;m AGAPE Assistant.</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                  Ask me anything about proposals, programs, volunteers, donations, or how to use the platform.
                </p>
              </div>
              {/* Suggested prompts */}
              <div className="flex flex-col gap-2 w-full max-w-sm mt-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-sm px-4 py-2.5 rounded-xl border border-border bg-surface-alt hover:bg-primary/5 hover:border-primary/30 text-foreground/80 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-white rounded-br-sm"
                    : "bg-surface-alt border border-border text-foreground rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-surface-alt border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-border px-4 py-3 flex gap-3 items-end bg-surface rounded-b-xl">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
            rows={1}
            placeholder="Ask me anything… (Enter to send, Shift+Enter for new line)"
            className="flex-1 resize-none text-sm bg-surface-alt border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground disabled:opacity-50 max-h-32 overflow-y-auto leading-relaxed"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            size="sm"
            className="w-10 h-10 p-0 rounded-xl bg-primary hover:bg-primary-light text-white shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-center text-[11px] text-muted mt-2 shrink-0">
        AGAPE Assistant is AI-powered and may make mistakes. Do not rely on it for official decisions.
      </p>
    </div>
  );
}
