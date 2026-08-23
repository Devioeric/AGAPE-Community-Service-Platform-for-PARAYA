import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { streamChatbotResponse, type ChatMessage } from "@/lib/ai/chatbot";
import { buildChatbotContext } from "@/lib/ai/chatbot-context";
import { buildQueryAwareContext } from "@/lib/ai/chatbot-query-router";
import { topicsForModule } from "@/lib/ai/chatbot-modules";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  conversationHistory: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4_000) }).strict()).max(20).default([]),
  module: z.string().trim().min(1).max(40).nullable().optional(),
}).strict();

export async function POST(request: Request) {
  const auth = await authorizeCapability("ai.assist");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid chatbot request" }, { status: 400 });
  const { message, conversationHistory, module } = parsed.data;
  if (module && !topicsForModule(module, auth.actor.role, auth.actor.permissions)) {
    return NextResponse.json({ error: "The selected assistant topic is unavailable to this account" }, { status: 403 });
  }
  if (auth.actor.role.startsWith("barangay_") && !auth.actor.barangayId) {
    return NextResponse.json({ error: "No barangay is assigned" }, { status: 403 });
  }
  const { data: profile } = await auth.supabase.from("users").select("full_name").eq("id", auth.actor.id).single();
  const [baseContext, queryContext] = await Promise.all([
    buildChatbotContext({ supabase: auth.supabase, userId: auth.actor.id, role: auth.actor.role, permissions: auth.actor.permissions }).catch(() => ""),
    buildQueryAwareContext({ supabase: auth.supabase, userId: auth.actor.id, role: auth.actor.role, permissions: auth.actor.permissions, barangayId: auth.actor.barangayId, message, module }).catch(() => ""),
  ]);
  const context = [baseContext, queryContext].filter(Boolean).join("\n\n");
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      try {
        for await (const chunk of streamChatbotResponse({ message, conversationHistory: conversationHistory as ChatMessage[], userRole: auth.actor.role, userName: profile?.full_name ?? "User", context })) send({ chunk });
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
