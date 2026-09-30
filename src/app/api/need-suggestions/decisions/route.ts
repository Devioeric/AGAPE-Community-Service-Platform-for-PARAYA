import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMany } from "@/lib/notifications/dispatch";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { isNeedSuggestionsEnabled } from "@/lib/community-needs/feature";
import {
  NEED_INDICATOR_CODES,
  NEED_SUGGESTION_POLICY,
  evaluateNeedSuggestions,
  needIndicatorDocumentSchema,
  type NeedSuggestion,
} from "@/lib/community-needs/need-suggestions";
import { needCategorySchema } from "@/lib/ai/advisory-recommendations";

const NO_STORE = { "Cache-Control": "private, no-store" };
const dismissReasonSchema = z.enum([
  "not_a_priority",
  "already_addressed",
  "data_quality_concern",
  "outside_paraya_scope",
  "duplicate_of_existing_need",
  "other",
]);

const decisionSchema = z.object({
  cycle_id: z.string().uuid(),
  indicator_code: z.enum(NEED_INDICATOR_CODES),
  decision: z.enum(["accept", "dismiss"]),
  reason_code: dismissReasonSchema.optional(),
  note: z.string().trim().max(500).optional(),
  need: z.object({
    title: z.string().trim().min(3).max(180).optional(),
    description: z.string().trim().max(2000).optional(),
    category: needCategorySchema.optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  }).strict().optional(),
}).strict();

const decisionResponseSchema = z.object({
  needId: z.string().uuid().optional(),
  decisionId: z.string().uuid(),
}).strict();

type RpcError = { code?: unknown; message?: unknown } | null | undefined;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function codeOf(error: RpcError): string | undefined {
  return error && typeof error.code === "string" ? error.code : undefined;
}

async function authorizeSuggestions() {
  const auth = await authorizeCapability("community_need.manage");
  if (!auth.ok) return auth;
  if (!hasCapability(auth.actor.role, auth.actor.permissions, "profiling.aggregate.read")) {
    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  }
  return auth;
}

function decisionFailure(error: RpcError) {
  const code = codeOf(error);
  if (code === "42501") return json({ error: "Forbidden" }, 403);
  if (code === "23505") return json({ error: "This suggestion was already decided." }, 409);
  if (code === "22023" || code === "23514") return json({ error: "The suggestion could not be accepted with the supplied information." }, 422);
  return json({ error: "Unable to record the suggestion decision. Please retry." }, 500);
}

export async function POST(request: Request) {
  const auth = await authorizeSuggestions();
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!isNeedSuggestionsEnabled()) return json({ error: "Data-derived need suggestions are disabled." }, 503);
  if (!isProfilingV2Enabled()) return json({ error: "Resident profiling is disabled." }, 503);

  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid need-suggestion decision" }, 400);
  const input = parsed.data;
  if (input.decision === "dismiss" && !input.reason_code) return json({ error: "A dismissal reason is required." }, 400);
  if (input.decision === "dismiss" && input.need !== undefined) {
    return json({ error: "Need details are only allowed when accepting a suggestion." }, 400);
  }
  if (input.decision === "accept" && (input.reason_code !== undefined || input.note !== undefined)) {
    return json({ error: "Dismissal fields are only allowed when dismissing a suggestion." }, 400);
  }

  let indicatorResult: { data: unknown; error: RpcError };
  try {
    indicatorResult = await auth.supabase.rpc("cna_need_indicators", { p_cycle_id: input.cycle_id });
  } catch {
    return json({ error: "Profiling indicators are temporarily unavailable." }, 503);
  }
  if (indicatorResult.error) {
    if (codeOf(indicatorResult.error) === "55000") return json({ error: "Resident profiling is not available." }, 503);
    return decisionFailure(indicatorResult.error);
  }
  const documentResult = needIndicatorDocumentSchema.safeParse(indicatorResult.data);
  if (!documentResult.success) return json({ error: "Profiling indicators are temporarily unavailable." }, 503);

  let suggestions: NeedSuggestion[];
  try {
    // The evaluator receives only aggregate data. The database RPC remains the
    // authority for cycle ownership, runtime, and capability scope.
    // The decision route does not need to expose a barangay display name. Use
    // a neutral label so an internal UUID can never be copied into the
    // persisted, human-facing need description.
    suggestions = evaluateNeedSuggestions({ document: documentResult.data, barangayName: "the selected barangay" });
  } catch {
    return json({ error: "Profiling indicators are temporarily unavailable." }, 503);
  }
  const suggestion = suggestions.find((item) => item.code === input.indicator_code);
  if (!suggestion) return json({ error: "This suggestion is no longer supported by the latest completed profiling data." }, 409);

  const pPayload: Record<string, unknown> = {
    cycle_id: input.cycle_id,
    indicator_code: input.indicator_code,
    decision: input.decision,
    policy: {
      version: suggestion.policyVersion,
      threshold: suggestion.threshold,
      highThreshold: suggestion.highThreshold,
      minBase: NEED_SUGGESTION_POLICY.minBase,
      percent: suggestion.percent,
      percentIsLowerBound: suggestion.percentIsLowerBound,
    },
  };
  if (input.reason_code !== undefined) pPayload.reason_code = input.reason_code;
  if (input.note !== undefined) pPayload.note = input.note;
  if (input.decision === "accept") {
    pPayload.need = {
      title: input.need?.title ?? suggestion.title,
      description: input.need?.description ?? suggestion.description,
      category: input.need?.category ?? suggestion.category,
      priority: input.need?.priority ?? suggestion.priority,
      affected_count: suggestion.affectedCount,
    };
  }

  let decisionResult: { data: unknown; error: RpcError };
  try {
    decisionResult = await auth.supabase.rpc("cna_decide_need_suggestion", { p_payload: pPayload });
  } catch {
    return json({ error: "Unable to record the suggestion decision. Please retry." }, 500);
  }
  if (decisionResult.error) return decisionFailure(decisionResult.error);

  const responseData = decisionResponseSchema.safeParse(decisionResult.data);
  if (!responseData.success) return json({ error: "Unable to record the suggestion decision. Please retry." }, 500);

  if (input.decision === "accept") {
    try {
      const admin = createAdminClient();
      const { data: officers } = await admin.from("users").select("id")
        .eq("role", "paraya_officer").eq("status", "active").eq("is_active", true);
      await notifyMany((officers ?? [])
        .map((officer) => officer.id)
        .filter((id): id is string => typeof id === "string" && id !== auth.actor.id), {
        title: "Community need awaiting PARAYA review",
        message: "A community need requires PARAYA Officer review.",
        type: "approval",
        action_url: "/officer/community-needs?status=pending_paraya_review",
      });
    } catch {
      // Notification delivery is best-effort, like normal need intake.
    }
  }
  return json({ data: responseData.data }, input.decision === "accept" ? 201 : 200);
}
