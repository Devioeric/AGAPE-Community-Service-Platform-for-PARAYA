"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ChatMessage } from "@/lib/ai/chatbot";
import { consumeChatbotStream, type ChatbotNavigationLink } from "@/lib/ai/chatbot-stream";
import { CHATBOT_LIMITS, normalizeChatHistory, type ChatbotConversationMemory } from "@/lib/ai/chatbot-token-budget";
import { planChatbotContext } from "@/lib/ai/chatbot-intent";
import type { PermissionOverrides } from "@/lib/auth/capabilities";
import { getRouteIdForPath } from "@/lib/navigation/catalog";

type RequestSnapshot = { message: string; conversationHistory: ChatMessage[]; module: string | null; conversationMemory: ChatbotConversationMemory; visibleHistory: ChatMessage[]; currentRouteId: string | null };

export function useChatbotConversation(role: string, permissions?: PermissionOverrides) {
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<ChatbotNavigationLink[]>([]);
  const pending = useRef<AbortController | null>(null);
  const lastRequest = useRef<RequestSnapshot | null>(null);
  const memory = useRef<ChatbotConversationMemory>({ topics: [], modules: [] });
  useEffect(() => () => { pending.current?.abort(); }, []);

  async function run(request: RequestSnapshot) {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    lastRequest.current = request;
    setError(null); setLoading(true); setNavigation([]);
    setMessages([...request.visibleHistory, { role: "user", content: request.message }, { role: "assistant", content: "" }]);
    try {
      const response = await fetch("/api/ai/chatbot", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ message: request.message, conversationHistory: request.conversationHistory, module: request.module, conversationMemory: request.conversationMemory, currentRouteId: request.currentRouteId }),
      });
      await consumeChatbotStream(response, text => {
        if (!controller.signal.aborted) setMessages([...request.visibleHistory, { role: "user", content: request.message }, { role: "assistant", content: text }]);
      }, links => {
        if (!controller.signal.aborted) setNavigation(links);
      });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error && ["The AI assistant", "The response was interrupted"].some(prefix => failure.message.startsWith(prefix))
        ? failure.message : "The connection dropped. Please try again.");
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return {
    messages, loading, error,
    send: (message: string, module: string | null = null) => {
      const text = message.trim().slice(0, CHATBOT_LIMITS.messageCharacters);
      if (!text || pending.current) return Promise.resolve();
      memory.current = planChatbotContext(text, module, role, permissions, memory.current).memory;
      return run({
        message: text,
        conversationHistory: normalizeChatHistory(messages.filter(item => item.content)),
        module,
        conversationMemory: memory.current,
        visibleHistory: messages.filter(item => item.content),
        currentRouteId: getRouteIdForPath(pathname),
      });
    },
    retry: () => lastRequest.current ? run(lastRequest.current) : Promise.resolve(),
    navigation,
    clear: () => { pending.current?.abort(); pending.current = null; lastRequest.current = null; memory.current = { topics: [], modules: [] }; setMessages([]); setNavigation([]); setLoading(false); setError(null); },
  };
}
