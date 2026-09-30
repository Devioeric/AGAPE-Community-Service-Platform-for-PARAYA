import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

const querySchema = z.object({
  barangay_id: z.string().uuid().optional(),
  cycle_id: z.string().uuid().optional(),
  status: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(25).default(25),
}).strict();

type Cycle = {
  id: string;
  barangay_id: string;
  barangay_name?: string;
  name: string;
  status: string;
  target_households?: number;
  approved_households?: number;
  row_version?: number;
};

type Submission = {
  id: string;
  household_code: string;
  sitio_name: string;
  status: string;
  resident_count: number;
  row_version: number;
  return_reason: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const needFields = "id, barangay_id, category, title, priority, approval_status, sitio, created_at, updated_at";

function emptyData(scope: { role: string; barangayId: string | null; cycleId: string | null }, warning?: string) {
  return {
    asOf: new Date().toISOString(),
    scope,
    filters: { barangays: [] as Array<{ id: string; name: string; allowed: boolean }>, statuses: ["draft", "pending", "approved", "returned", "needs_revision", "rejected"] },
    kpis: { totalHouseholds: 0, totalResidents: 0, approvedPackages: 0, awaitingReview: 0, returnedPackages: 0, highPriorityNeeds: 0 },
    profiles: { rows: [] as Array<Record<string, unknown>>, page: 1, pageSize: 25, total: 0 },
    needs: { rows: [] as Array<Record<string, unknown>>, page: 1, pageSize: 25, total: 0 },
    availability: { profiling: "empty" as "available" | "empty" | "unavailable" | "suppressed", needs: "empty" as "available" | "empty" | "unavailable" | "suppressed" },
    warnings: warning ? [warning] : [],
  };
}

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();

  const auth = await authorizeAnyCapability([
    "profiling.aggregate.read",
    "profiling.collect",
    "profiling.validate",
    "profiling.detail.read",
  ]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profiling summary filters" }, { status: 400, headers });

  const requestedBarangay = parsed.data.barangay_id ?? null;
  const isSecretary = auth.actor.role === "barangay_secretary";
  if (isSecretary && requestedBarangay && requestedBarangay !== auth.actor.barangayId) {
    return NextResponse.json({ error: "Cross-barangay profiling access is not allowed" }, { status: 403, headers });
  }
  const barangayId = isSecretary ? auth.actor.barangayId : requestedBarangay;
  const scope = { role: auth.actor.role, barangayId, cycleId: parsed.data.cycle_id ?? null };

  try {
    const cycleResult = await auth.supabase.rpc("phase1_list_profiling_cycles", { p_barangay_id: barangayId });
    if (cycleResult.error) return profilingRpcError(cycleResult.error);
    const cycles = (cycleResult.data ?? []) as Cycle[];
    // The cycle RPC returns ids only; label the already-authorized barangays.
    const cycleBarangayIds = Array.from(new Set(cycles.map((cycle) => cycle.barangay_id)));
    if (cycleBarangayIds.length) {
      const { data: barangayRows } = await createAdminClient().from("barangays").select("id, name").in("id", cycleBarangayIds);
      const names = new Map((barangayRows ?? []).map((row) => [String(row.id), String(row.name)]));
      for (const cycle of cycles) cycle.barangay_name ??= names.get(cycle.barangay_id);
    }
    const availableBarangays = Array.from(new Map(cycles.map((cycle) => [cycle.barangay_id, { id: cycle.barangay_id, name: cycle.barangay_name ?? cycle.barangay_id, allowed: true }])).values());
    const selectedCycle = parsed.data.cycle_id
      ? cycles.find((cycle) => cycle.id === parsed.data.cycle_id)
      : cycles[0];
    if (parsed.data.cycle_id && !selectedCycle) return NextResponse.json({ error: "Profiling cycle is not available" }, { status: 404, headers });

    if (!selectedCycle) {
      const data = emptyData({ ...scope, cycleId: null });
      data.filters.barangays = availableBarangays;
      const canReadNeeds = hasCapability(auth.actor.role, auth.actor.permissions, "community_need.read");
      if (canReadNeeds) {
        const admin = createAdminClient();
        let needsQuery = admin.from("community_needs").select(needFields).order("created_at", { ascending: false }).limit(250);
        if (isSecretary && auth.actor.barangayId) needsQuery = needsQuery.eq("barangay_id", auth.actor.barangayId);
        else if (barangayId) needsQuery = needsQuery.eq("barangay_id", barangayId);
        const needsResult = await needsQuery;
        if (needsResult.error) {
          data.availability.needs = "unavailable";
          data.warnings.push("Community needs are temporarily unavailable.");
        } else {
          const needs = (needsResult.data ?? []).map((need) => ({
            id: String(need.id), barangayId: String(need.barangay_id), category: String(need.category ?? "other"),
            title: String(need.title ?? "Community need"), priority: String(need.priority ?? "medium"),
            status: String(need.approval_status ?? "draft"), sitio: typeof need.sitio === "string" ? need.sitio : null,
            submittedAt: typeof need.created_at === "string" ? need.created_at : null,
            reviewedAt: typeof need.updated_at === "string" ? need.updated_at : null,
          }));
          data.needs = { rows: needs.slice(0, 25), page: 1, pageSize: 25, total: needs.length };
          data.kpis.highPriorityNeeds = needs.filter((need) => ["high", "critical"].includes(need.priority) && !["draft", "rejected"].includes(need.status)).length;
          data.availability.needs = needs.length ? "available" : "empty";
        }
      } else data.availability.needs = "suppressed";
      return NextResponse.json({ data }, { headers });
    }

    const canReadDetail = hasCapability(auth.actor.role, auth.actor.permissions, "profiling.detail.read")
      || hasCapability(auth.actor.role, auth.actor.permissions, "profiling.validate")
      || hasCapability(auth.actor.role, auth.actor.permissions, "profiling.collect");
    const canReadAggregate = hasCapability(auth.actor.role, auth.actor.permissions, "profiling.aggregate.read");

    const [submissionsResult, aggregateResult] = await Promise.allSettled([
      canReadDetail ? auth.supabase.rpc("phase1_list_profiling_submissions", { p_cycle_id: selectedCycle.id }) : Promise.resolve({ data: [], error: null }),
      canReadAggregate ? auth.supabase.rpc("phase1_profiling_aggregate", { p_cycle_id: selectedCycle.id }) : Promise.resolve({ data: null, error: null }),
    ]);

    const warnings: string[] = [];
    const submissionsOk = submissionsResult.status === "fulfilled" && !submissionsResult.value.error;
    const submissions = submissionsOk ? ((submissionsResult.value.data ?? []) as Submission[]) : [];
    if (!submissionsOk && canReadDetail) warnings.push("Profile package records are temporarily unavailable.");

    const aggregateOk = aggregateResult.status === "fulfilled" && !aggregateResult.value.error;
    const aggregate = aggregateOk ? aggregateResult.value.data as { sample?: { approvedHouseholds?: number; approvedResidents?: number }; asOf?: string } | null : null;
    if (!aggregateOk && canReadAggregate) warnings.push("Approved profiling aggregates are temporarily unavailable.");

    const status = parsed.data.status;
    const queryText = parsed.data.q?.toLowerCase() ?? "";
    const filteredSubmissions = submissions.filter((submission) => {
      const statusMatches = !status || submission.status === status;
      const queryMatches = !queryText || [submission.household_code, submission.sitio_name, submission.status].join(" ").toLowerCase().includes(queryText);
      return statusMatches && queryMatches;
    });
    const start = (parsed.data.page - 1) * parsed.data.page_size;
    const profileRows = filteredSubmissions.slice(start, start + parsed.data.page_size).map((submission) => ({
      packageId: submission.id,
      householdCode: submission.household_code,
      barangayId: selectedCycle.barangay_id,
      barangayName: selectedCycle.barangay_name ?? selectedCycle.barangay_id,
      sitio: submission.sitio_name || null,
      residentCount: Number.isFinite(submission.resident_count) ? submission.resident_count : null,
      priorityNeedCount: null,
      status: submission.status,
      submittedAt: submission.created_at ?? null,
      reviewedAt: submission.updated_at ?? null,
      returnReason: submission.return_reason ?? null,
    }));

    const admin = createAdminClient();
    const canReadNeeds = hasCapability(auth.actor.role, auth.actor.permissions, "community_need.read");
    let needsQueryResult: { data: Array<Record<string, unknown>> | null; error: { code?: string } | null } = { data: [], error: null };
    if (canReadNeeds) {
      let needsQuery = admin.from("community_needs").select(needFields).order("created_at", { ascending: false }).limit(250);
      if (isSecretary && auth.actor.barangayId) needsQuery = needsQuery.eq("barangay_id", auth.actor.barangayId);
      else if (barangayId) needsQuery = needsQuery.eq("barangay_id", barangayId);
      if (status && ["draft", "approved", "pending_paraya_review", "needs_revision", "rejected"].includes(status)) needsQuery = needsQuery.eq("approval_status", status);
      needsQueryResult = await needsQuery;
    }
    const needsOk = !needsQueryResult.error;
    if (!needsOk) warnings.push("Community needs are temporarily unavailable.");
    const needs = (needsQueryResult.data ?? []).map((need) => ({
      id: String(need.id),
      barangayId: String(need.barangay_id),
      category: String(need.category ?? "other"),
      title: String(need.title ?? "Community need"),
      priority: String(need.priority ?? "medium"),
      status: String(need.approval_status ?? "draft"),
      sitio: typeof need.sitio === "string" ? need.sitio : null,
      submittedAt: typeof need.created_at === "string" ? need.created_at : null,
      reviewedAt: typeof need.updated_at === "string" ? need.updated_at : null,
    }));
    const filteredNeeds = needs.filter((need) => {
      const statusMatches = !status || need.status === status;
      const queryMatches = !queryText || [need.title, need.category, need.priority, need.status, need.sitio ?? ""].join(" ").toLowerCase().includes(queryText);
      return statusMatches && queryMatches;
    });
    const kpiNeeds = needs.filter((need) => !["rejected", "draft"].includes(need.status));
    const data = {
      asOf: typeof aggregate?.asOf === "string" ? aggregate.asOf : new Date().toISOString(),
      scope: { ...scope, cycleId: selectedCycle.id },
      filters: { barangays: availableBarangays, statuses: ["draft", "pending", "approved", "returned", "needs_revision", "rejected"] },
      kpis: {
        totalHouseholds: typeof aggregate?.sample?.approvedHouseholds === "number" ? aggregate.sample.approvedHouseholds : null,
        totalResidents: typeof aggregate?.sample?.approvedResidents === "number" ? aggregate.sample.approvedResidents : null,
        approvedPackages: submissions.filter((submission) => submission.status === "approved").length,
        awaitingReview: submissions.filter((submission) => submission.status === "pending").length,
        returnedPackages: submissions.filter((submission) => submission.status === "returned").length,
        highPriorityNeeds: kpiNeeds.filter((need) => ["high", "critical"].includes(need.priority)).length,
      },
      profiles: { rows: profileRows, page: parsed.data.page, pageSize: parsed.data.page_size, total: filteredSubmissions.length },
      needs: { rows: filteredNeeds.slice(start, start + parsed.data.page_size), page: parsed.data.page, pageSize: parsed.data.page_size, total: filteredNeeds.length },
      availability: { profiling: submissionsOk || aggregateOk ? "available" : "unavailable", needs: canReadNeeds ? (needsOk ? (needs.length ? "available" : "empty") : "unavailable") : "suppressed" },
      warnings,
    };
    return NextResponse.json({ data }, { headers });
  } catch {
    return NextResponse.json({ error: "Profiling summary is temporarily unavailable. Please retry." }, { status: 503, headers });
  }
}
