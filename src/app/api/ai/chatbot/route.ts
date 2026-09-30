import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { getChatbotNavigationLinks, streamChatbotResponse, type ChatMessage } from "@/lib/ai/chatbot";
import { buildChatbotContext } from "@/lib/ai/chatbot-context";
import { buildQueryAwareContext } from "@/lib/ai/chatbot-query-router";
import { topicsForModule } from "@/lib/ai/chatbot-modules";
import { planChatbotContext } from "@/lib/ai/chatbot-intent";
import { buildRelevantNavigationContext } from "@/lib/ai/chatbot";
import { capChatbotContext, normalizeChatHistory, CONTEXT_UNAVAILABLE, type ChatbotConversationMemory } from "@/lib/ai/chatbot-token-budget";
import { getNavigationEntry, isNavigationEntryVisible } from "@/lib/navigation/catalog";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  conversationHistory: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4_000) }).strict()).max(20).default([]),
  module: z.string().trim().min(1).max(40).nullable().optional(),
  conversationMemory: z.object({
    topics: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    modules: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  }).strict().optional(),
  currentRouteId: z.string().trim().min(1).max(80).nullable().optional(),
}).strict();

function assistantFeatureFlags() {
  return {
    AGAPE_PROFILING_V2_ENABLED: process.env.AGAPE_PROFILING_V2_ENABLED === "true",
    AGAPE_PARTNER_REGISTRY_V2_ENABLED: process.env.AGAPE_PARTNER_REGISTRY_V2_ENABLED === "true",
    AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED: process.env.AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED === "true",
    AGAPE_PROPOSALS_V2_ENABLED: process.env.AGAPE_PROPOSALS_V2_ENABLED === "true",
    AGAPE_PROGRAM_FINANCE_V2_ENABLED: process.env.AGAPE_PROGRAM_FINANCE_V2_ENABLED === "true",
  } as const;
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("ai.assist");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid chatbot request" }, { status: 400 });
  const { message, conversationHistory, module, conversationMemory } = parsed.data;
  const candidateRoute = parsed.data.currentRouteId ? getNavigationEntry(parsed.data.currentRouteId) : null;
  const currentRouteId = candidateRoute && isNavigationEntryVisible(candidateRoute, auth.actor.role, auth.actor.permissions, assistantFeatureFlags())
    ? candidateRoute.id
    : null;
  if (module && !topicsForModule(module, auth.actor.role, auth.actor.permissions)) {
    return NextResponse.json({ error: "The selected assistant topic is unavailable to this account" }, { status: 403 });
  }
  if (auth.actor.role.startsWith("barangay_") && !auth.actor.barangayId) {
    return NextResponse.json({ error: "No barangay is assigned" }, { status: 403 });
  }
  const plan = planChatbotContext(message, module, auth.actor.role, auth.actor.permissions, conversationMemory);
  const boundedHistory = normalizeChatHistory(conversationHistory as ChatMessage[]);
  let context = "";
  // General messages (greetings, open questions) also get the compact live summary,
  // so the assistant always knows the current state; how-to questions stay navigation-only.
  if (plan.kind === "baseline" || plan.kind === "general") {
    context = await buildChatbotContext({
      supabase: auth.supabase,
      userId: auth.actor.id,
      role: auth.actor.role,
      permissions: auth.actor.permissions,
      barangayId: auth.actor.barangayId,
    }).catch(() => CONTEXT_UNAVAILABLE);
  } else if (plan.kind === "topics") {
    context = await buildQueryAwareContext({
      supabase: auth.supabase,
      userId: auth.actor.id,
      role: auth.actor.role,
      permissions: auth.actor.permissions,
      barangayId: auth.actor.barangayId,
      message,
      module,
      topics: plan.topics,
    }).catch(() => CONTEXT_UNAVAILABLE);
  }
  context = capChatbotContext(context);
  const navigationContext = plan.kind === "navigation"
    ? buildRelevantNavigationContext(auth.actor.role, plan.topics, auth.actor.permissions, currentRouteId, assistantFeatureFlags(), message)
    : undefined;
  const navigationV2Enabled = process.env.AGAPE_ASSISTANT_NAVIGATION_V2_ENABLED !== "false";
  const navigationLinks = navigationV2Enabled && plan.kind === "navigation" && typeof getChatbotNavigationLinks === "function"
    ? getChatbotNavigationLinks(auth.actor.role, plan.topics, auth.actor.permissions, currentRouteId, assistantFeatureFlags(), message)
    : [];
  const memory: ChatbotConversationMemory = plan.memory;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      try {
        if (navigationLinks.length) send({ chunk: "", navigation: navigationLinks });
        for await (const chunk of streamChatbotResponse({
          message,
          conversationHistory: boundedHistory,
          userRole: auth.actor.role,
          context,
          navigationContext,
          currentRouteId,
          conversationMemory: memory,
          metricsContext: {
            historyCharacters: boundedHistory.reduce((total, item) => total + item.content.length, 0),
            contextCharacters: context.length,
            selectedTopicCount: plan.topics.length,
          },
          onMetrics: (metrics) => console.info("[chatbot-metrics]", JSON.stringify(metrics)),
        })) send({ chunk });
        controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close();
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        send({ error: text.includes("429") ? "The AI assistant is temporarily rate-limited." : "The AI assistant is temporarily unavailable." });
        controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
