import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { isNeedSuggestionsEnabled } from "@/lib/community-needs/feature";
import {
  NEED_SUGGESTION_POLICY,
  evaluateNeedSuggestions,
  needIndicatorDocumentSchema,
  type NeedSuggestion,
} from "@/lib/community-needs/need-suggestions";

const NO_STORE = { "Cache-Control": "private, no-store" };
const activeApprovalStatuses = ["pending_paraya_review", "needs_revision", "approved"] as const;
const querySchema = z.object({ barangay_id: z.string().uuid().optional() }).strict();

type RpcError = { code?: unknown; message?: unknown } | null | undefined;
type ProfilingCycle = {
  id: string;
  barangay_id: string;
  name: string;
  status: string;
  collection_ends_on?: string | null;
  completed_at?: string | null;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function errorCode(error: RpcError): string | undefined {
  return error && typeof error.code === "string" ? error.code : undefined;
}

function rpcErrorResponse(error: RpcError) {
  // Do not pass database diagnostics through this advisory endpoint. Keep the
  // status useful to the UI while returning only stable, human-safe text.
  const code = errorCode(error);
  if (code === "42501") return json({ error: "You do not have access to profiling suggestions." }, 403);
  if (code === "P0002") return json({ error: "The requested profiling cycle was not found." }, 404);
  if (code === "40001") return json({ error: "The profiling data changed. Please retry." }, 409);
  if (code === "22023" || code === "23514") return json({ error: "The profiling data is not ready for suggestions." }, 422);
  return json({ error: "Profiling suggestions are temporarily unavailable. Please retry." }, 503);
}

function normalizeRpcArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function cycleDate(value: string | null | undefined): number {
  const timestamp = value ? Date.parse(value) : Number.NEGATIVE_INFINITY;
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function chooseLatestCycles(value: unknown): ProfilingCycle[] {
  const cycles = normalizeRpcArray(value).filter((item): item is ProfilingCycle => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return typeof row.id === "string"
      && typeof row.barangay_id === "string"
      && typeof row.name === "string"
      && (row.status === "completed" || row.status === "archived");
  });
  const latest = new Map<string, ProfilingCycle>();
  for (const cycle of cycles) {
    const current = latest.get(cycle.barangay_id);
    if (!current
      || cycleDate(cycle.collection_ends_on) > cycleDate(current.collection_ends_on)
      || (cycleDate(cycle.collection_ends_on) === cycleDate(current.collection_ends_on)
        && cycleDate(cycle.completed_at) > cycleDate(current.completed_at))) {
      latest.set(cycle.barangay_id, cycle);
    }
  }
  return Array.from(latest.values())
    .sort((left, right) => left.barangay_id.localeCompare(right.barangay_id))
    .slice(0, 50);
}

async function authorizeSuggestions() {
  const auth = await authorizeCapability("community_need.manage");
  if (!auth.ok) return auth;
  if (!hasCapability(auth.actor.role, auth.actor.permissions, "profiling.aggregate.read")) {
    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  }
  return auth;
}

function disabledPayload(reason: "need_suggestions_disabled" | "profiling_disabled" | "profiling_runtime_off") {
  return { data: { status: "disabled", reason, barangays: [] } };
}

async function loadBarangayNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  try {
    const admin = createAdminClient();
    const result = await admin.from("barangays").select("id,name").in("id", ids);
    for (const row of result.data ?? []) {
      if (typeof row?.id === "string" && typeof row?.name === "string") names.set(row.id, row.name);
    }
  } catch {
    // A missing display-name lookup must not expose a failed aggregate as zero
    // or leak an internal UUID into the UI. The stable generic label keeps the
    // response useful without turning a lookup failure into identifying data.
  }
  return names;
}

type SuggestionBarangay = {
  barangayId: string;
  barangayName: string;
  status: "ready" | "unavailable";
  cycle: { id: string; name: string; reportingDate: string } | null;
  sample: { approvedHouseholds: number; approvedResidents: number } | null;
  suggestions: NeedSuggestion[];
  decidedCount: number;
  trackedCount: number;
};

async function readDecisionState(suggestions: NeedSuggestion[]) {
  const byFingerprint = new Set(suggestions.map((suggestion) => suggestion.fingerprint));
  const accepted = new Map<string, { fingerprint: string; barangayId: string; indicatorCode: string; needId: string }>();
  const decided = new Set<string>();
  if (!byFingerprint.size) return { decided, accepted };

  const admin = createAdminClient();
  const result = await admin.from("community_need_suggestion_decisions")
    .select("fingerprint,decision,barangay_id,indicator_code,need_id")
    .in("fingerprint", Array.from(byFingerprint));
  if (result.error) throw result.error;
  for (const row of result.data ?? []) {
    if (typeof row?.fingerprint !== "string" || !byFingerprint.has(row.fingerprint)) continue;
    decided.add(row.fingerprint);
    if (row.decision === "accepted" && typeof row.need_id === "string") {
      accepted.set(row.fingerprint, {
        fingerprint: row.fingerprint,
        barangayId: String(row.barangay_id),
        indicatorCode: String(row.indicator_code),
        needId: row.need_id,
      });
    }
  }
  return { decided, accepted };
}

async function readTrackedNeeds(accepted: Map<string, { fingerprint: string; barangayId: string; indicatorCode: string; needId: string }>) {
  const needIds = Array.from(accepted.values()).map((item) => item.needId);
  const tracked = new Set<string>();
  if (!needIds.length) return tracked;
  const admin = createAdminClient();
  const result = await admin.from("community_needs")
    .select("id,barangay_id,approval_status,status")
    .in("id", needIds);
  if (result.error) throw result.error;
  const active = new Set<string>(activeApprovalStatuses);
  const acceptedByNeedId = new Map(Array.from(accepted.values()).map((item) => [item.needId, item]));
  for (const row of result.data ?? []) {
    if (!row || typeof row.id !== "string") continue;
    if (active.has(String(row.approval_status)) && String(row.status ?? "") !== "addressed") {
      const acceptedDecision = acceptedByNeedId.get(row.id);
      if (acceptedDecision && String(row.barangay_id) === acceptedDecision.barangayId) {
        tracked.add(`${acceptedDecision.barangayId}|${acceptedDecision.indicatorCode}`);
      }
    }
  }
  return tracked;
}

export async function GET(request: Request) {
  const auth = await authorizeSuggestions();
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const params = new URL(request.url).searchParams;
  const keys = Array.from(params.keys());
  if (keys.some((key) => key !== "barangay_id") || params.getAll("barangay_id").length > 1) {
    return json({ error: "Invalid need-suggestion filters" }, 400);
  }
  const parsedQuery = querySchema.safeParse(Object.fromEntries(params.entries()));
  if (!parsedQuery.success) return json({ error: "Invalid need-suggestion filters" }, 400);

  if (!isNeedSuggestionsEnabled()) return json(disabledPayload("need_suggestions_disabled"));
  if (!isProfilingV2Enabled()) return json(disabledPayload("profiling_disabled"));

  let cycleData: unknown;
  let cycleError: RpcError = null;
  try {
    const result = await auth.supabase.rpc("phase1_list_profiling_cycles", {
      p_barangay_id: parsedQuery.data.barangay_id ?? null,
    });
    cycleData = result.data;
    cycleError = result.error;
  } catch {
    return json({ error: "Profiling suggestions are temporarily unavailable. Please retry." }, 503);
  }
  if (cycleError) {
    if (errorCode(cycleError) === "55000") return json(disabledPayload("profiling_runtime_off"));
    return rpcErrorResponse(cycleError);
  }

  const cycles = chooseLatestCycles(cycleData);
  const names = await loadBarangayNames(cycles.map((cycle) => cycle.barangay_id));
  const barangays: SuggestionBarangay[] = [];
  const allSuggestions: NeedSuggestion[] = [];

  for (const cycle of cycles) {
    const barangayName = names.get(cycle.barangay_id) ?? "Authorized barangay";
    const cycleSummary = {
      id: cycle.id,
      name: cycle.name,
      reportingDate: String(cycle.collection_ends_on ?? ""),
    };
    let result: { data: unknown; error: RpcError };
    try {
      result = await auth.supabase.rpc("cna_need_indicators", { p_cycle_id: cycle.id });
    } catch {
      barangays.push({ barangayId: cycle.barangay_id, barangayName, status: "unavailable", cycle: cycleSummary, sample: null, suggestions: [], decidedCount: 0, trackedCount: 0 });
      continue;
    }
    if (result.error) {
      barangays.push({ barangayId: cycle.barangay_id, barangayName, status: "unavailable", cycle: cycleSummary, sample: null, suggestions: [], decidedCount: 0, trackedCount: 0 });
      continue;
    }
    const documentResult = needIndicatorDocumentSchema.safeParse(result.data);
    if (!documentResult.success) {
      barangays.push({ barangayId: cycle.barangay_id, barangayName, status: "unavailable", cycle: cycleSummary, sample: null, suggestions: [], decidedCount: 0, trackedCount: 0 });
      continue;
    }
    try {
      // The indicator snapshot is authoritative for the reporting date and
      // cycle label; do not trust a mutable cycle-list presentation field.
      const snapshotCycle = documentResult.data.cycle;
      const suggestions = evaluateNeedSuggestions({ document: documentResult.data, barangayName });
      allSuggestions.push(...suggestions);
      barangays.push({
        barangayId: cycle.barangay_id,
        barangayName,
        status: "ready",
        cycle: { id: snapshotCycle.id, name: snapshotCycle.name, reportingDate: snapshotCycle.reportingDate },
        sample: documentResult.data.sample,
        suggestions,
        decidedCount: 0,
        trackedCount: 0,
      });
    } catch {
      barangays.push({ barangayId: cycle.barangay_id, barangayName, status: "unavailable", cycle: cycleSummary, sample: null, suggestions: [], decidedCount: 0, trackedCount: 0 });
    }
  }

  if (allSuggestions.length) {
    try {
      const state = await readDecisionState(allSuggestions);
      const tracked = await readTrackedNeeds(state.accepted);
      for (const barangay of barangays) {
        const visible = barangay.suggestions.filter((suggestion) => {
          const isDecided = state.decided.has(suggestion.fingerprint);
          const isTracked = tracked.has(`${barangay.barangayId}|${suggestion.code}`);
          return !isDecided && !isTracked;
        });
        barangay.decidedCount = barangay.suggestions.filter((suggestion) => state.decided.has(suggestion.fingerprint)).length;
        barangay.trackedCount = barangay.suggestions.filter((suggestion) => tracked.has(`${barangay.barangayId}|${suggestion.code}`)).length;
        barangay.suggestions = visible;
      }
    } catch {
      return json({ error: "Need suggestions are temporarily unavailable. Please retry." }, 503);
    }
  }

  return json({
    data: {
      status: "ready",
      policyVersion: NEED_SUGGESTION_POLICY.version,
      generatedAt: new Date().toISOString(),
      barangays,
    },
  });
}

