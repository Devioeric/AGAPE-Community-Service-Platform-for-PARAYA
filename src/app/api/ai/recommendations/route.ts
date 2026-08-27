import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { buildAdvisoryRecommendations } from "@/lib/ai/advisory-recommendations";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { validateProfilingAggregateDTO } from "@/lib/profiling/privacy";
import { isPhase2ComponentEnabled } from "@/lib/phase2/feature";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfilingAggregateDTO } from "@/types/profiling";

const querySchema = z.object({
  barangay_id: z.string().uuid().optional(),
}).strict();

const PLANNED_PROPOSAL_STATUSES = new Set([
  "submitted",
  "pre_screening",
  "sdg_review",
  "evidence_review",
  "finance_review",
  "director_review",
  "revisions_requested",
  "approved",
]);
const ACTIVE_PROGRAM_STATUSES = new Set(["planning", "upcoming", "active"]);

function isMissingOptionalPhase2Relation(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function queryObject(searchParams: URLSearchParams): Record<string, string> | null {
  const result: Record<string, string> = {};
  let hasDuplicate = false;
  searchParams.forEach((value, key) => {
    if (key in result) hasDuplicate = true;
    result[key] = value;
  });
  return hasDuplicate ? null : result;
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string) {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

type CoverageLevel = "partial" | "full";

function addCoverage(
  map: Map<string, Map<string, CoverageLevel>>,
  needId: string,
  entityId: string,
  coverage: CoverageLevel,
) {
  const values = map.get(needId) ?? new Map<string, CoverageLevel>();
  const current = values.get(entityId);
  values.set(entityId, current === "full" || coverage === "full" ? "full" : "partial");
  map.set(needId, values);
}

export async function GET(request: Request) {
  const auth = await authorizeCapability("analytics.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasCapability(auth.actor.role, auth.actor.permissions, "ai.assist")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawQuery = queryObject(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json({ error: "Only one valid barangay_id may be supplied" }, { status: 400 });
  }

  const admin = createAdminClient();
  let needsQuery = admin
    .from("community_needs")
    .select("id,barangay_id,category,priority_score,status,identified_date,barangays(name)")
    .eq("approval_status", "approved")
    .neq("status", "addressed")
    .order("priority_score", { ascending: false, nullsFirst: false })
    .limit(500);
  if (parsed.data.barangay_id) needsQuery = needsQuery.eq("barangay_id", parsed.data.barangay_id);

  const { data: needRows, error: needsError } = await needsQuery;
  if (needsError) {
    console.error("[ai-recommendations] approved need query failed", { code: needsError.code });
    return NextResponse.json({ error: "Unable to load approved community needs" }, { status: 500 });
  }

  const needIds = (needRows ?? []).map((row) => row.id);
  const barangayIds = Array.from(new Set((needRows ?? []).map((row) => row.barangay_id)));
  const historyAsOfDate = new Date().toISOString().slice(0, 10);
  const historyWindowStartDate = new Date(`${historyAsOfDate}T00:00:00.000Z`);
  historyWindowStartDate.setUTCFullYear(historyWindowStartDate.getUTCFullYear() - 5);
  const historyWindowStart = historyWindowStartDate.toISOString().slice(0, 10);
  const historyByCategory = new Map<string, { matchedRecords: number; budgetTotals: number[]; volunteerCounts: number[] }>();
  if (isPhase2ComponentEnabled("historical_programs")) {
    const runtimeResult = await admin
      .from("phase2_component_runtime")
      .select("mode")
      .eq("component", "historical_programs")
      .maybeSingle();
    if (runtimeResult.error) {
      console.error("[ai-recommendations] historical runtime query failed", { code: runtimeResult.error.code });
      return NextResponse.json({ error: "Unable to verify historical benchmark runtime" }, { status: 500 });
    }
    if (runtimeResult.data?.mode === "synthetic" || runtimeResult.data?.mode === "live") {
      const historyResult = await admin
        .from("historical_programs")
        .select("category,budget_total,volunteer_count,quality,status,starts_on,data_mode")
        .in("status", ["accepted", "archived"])
        .in("quality", ["complete", "partial_verified"])
        .eq("data_mode", runtimeResult.data.mode)
        .gte("starts_on", historyWindowStart)
        .lte("starts_on", historyAsOfDate)
        .limit(2_000);
      if (historyResult.error) {
        console.error("[ai-recommendations] verified history benchmark query failed", { code: historyResult.error.code });
        return NextResponse.json({ error: "Unable to load verified historical benchmarks" }, { status: 500 });
      }
      for (const row of historyResult.data ?? []) {
        const values = historyByCategory.get(row.category) ?? { matchedRecords: 0, budgetTotals: [], volunteerCounts: [] };
        values.matchedRecords += 1;
        const budget = row.budget_total === null ? null : Number(row.budget_total);
        const volunteers = row.volunteer_count === null ? null : Number(row.volunteer_count);
        if (budget !== null && Number.isFinite(budget) && budget >= 0) values.budgetTotals.push(budget);
        if (volunteers !== null && Number.isInteger(volunteers) && volunteers >= 0) values.volunteerCounts.push(volunteers);
        historyByCategory.set(row.category, values);
      }
    }
  }
  const profilingByBarangay = new Map<string, { snapshotId: string; aggregate: ProfilingAggregateDTO }>();
  if (barangayIds.length > 0) {
    const cyclesResult = await admin
      .from("profiling_cycles")
      .select("id,barangay_id,collection_ends_on,status")
      .in("barangay_id", barangayIds)
      .in("status", ["completed", "archived"])
      .order("collection_ends_on", { ascending: false })
      .limit(500);
    if (cyclesResult.error) {
      console.error("[ai-recommendations] profiling cycle context query failed", { code: cyclesResult.error.code });
      return NextResponse.json({ error: "Unable to load approved aggregate context" }, { status: 500 });
    }
    const cycleIds = (cyclesResult.data ?? []).map((cycle) => cycle.id);
    if (cycleIds.length > 0) {
      const evidenceResult = await admin
        .from("profiling_evidence_snapshots")
        .select("id,cycle_id,aggregate_schema_version,aggregate_data,generated_at")
        .in("cycle_id", cycleIds)
        .eq("aggregate_schema_version", "agape.profiling.aggregate.v2")
        .order("generated_at", { ascending: false })
        .limit(500);
      if (evidenceResult.error) {
        console.error("[ai-recommendations] profiling evidence context query failed", { code: evidenceResult.error.code });
        return NextResponse.json({ error: "Unable to load approved aggregate context" }, { status: 500 });
      }
      const evidenceByCycle = new Map<string, { id: string; aggregate: ProfilingAggregateDTO }>();
      for (const evidence of evidenceResult.data ?? []) {
        if (evidenceByCycle.has(evidence.cycle_id)) continue;
        try {
          evidenceByCycle.set(evidence.cycle_id, {
            id: evidence.id,
            aggregate: validateProfilingAggregateDTO(evidence.aggregate_data),
          });
        } catch {
          console.warn("[ai-recommendations] ignored invalid aggregate evidence", { snapshotId: evidence.id });
        }
      }
      for (const cycle of cyclesResult.data ?? []) {
        if (profilingByBarangay.has(cycle.barangay_id)) continue;
        const evidence = evidenceByCycle.get(cycle.id);
        if (!evidence || evidence.aggregate.cycle.id !== cycle.id) continue;
        profilingByBarangay.set(cycle.barangay_id, { snapshotId: evidence.id, aggregate: evidence.aggregate });
      }
    }
  }
  const proposalIdsByNeed = new Map<string, Set<string>>();
  const programIdsByNeed = new Map<string, Set<string>>();
  const proposalCoverageByNeed = new Map<string, Map<string, CoverageLevel>>();
  const programCoverageByNeed = new Map<string, Map<string, CoverageLevel>>();

  if (needIds.length > 0) {
    const [v2ProposalLinks, legacyProposalLinks, v2ProgramLinks] = await Promise.all([
      admin.from("proposal_need_links_v2").select("need_id,proposal_id,intended_coverage").in("need_id", needIds),
      admin.from("proposal_validation_links").select("source_id,proposal_id").eq("source_type", "community_need").in("source_id", needIds),
      admin.from("program_need_links_v2").select("need_id,program_id,intended_coverage").in("need_id", needIds),
    ]);
    const linkError = legacyProposalLinks.error
      ?? (v2ProposalLinks.error && !isMissingOptionalPhase2Relation(v2ProposalLinks.error) ? v2ProposalLinks.error : null)
      ?? (v2ProgramLinks.error && !isMissingOptionalPhase2Relation(v2ProgramLinks.error) ? v2ProgramLinks.error : null);
    if (linkError) {
      console.error("[ai-recommendations] coverage link query failed", { code: linkError.code });
      return NextResponse.json({ error: "Unable to evaluate project coverage" }, { status: 500 });
    }

    for (const link of v2ProposalLinks.data ?? []) {
      addToSetMap(proposalIdsByNeed, link.need_id, link.proposal_id);
      addCoverage(proposalCoverageByNeed, link.need_id, link.proposal_id, link.intended_coverage === "full" ? "full" : "partial");
    }
    for (const link of legacyProposalLinks.data ?? []) addToSetMap(proposalIdsByNeed, link.source_id, link.proposal_id);
    for (const link of v2ProgramLinks.data ?? []) {
      addToSetMap(programIdsByNeed, link.need_id, link.program_id);
      addCoverage(programCoverageByNeed, link.need_id, link.program_id, link.intended_coverage === "full" ? "full" : "partial");
    }
  }

  const proposalIds = Array.from(new Set(Array.from(proposalIdsByNeed.values()).flatMap((ids) => Array.from(ids))));
  const proposalStatuses = new Map<string, string>();
  if (proposalIds.length > 0) {
    const [proposalsResult, profilesResult, legacyProgramsResult] = await Promise.all([
      admin.from("project_proposals").select("id,status").in("id", proposalIds),
      admin.from("proposal_v2_profiles").select("proposal_id,workflow_status").in("proposal_id", proposalIds),
      admin.from("programs").select("id,proposal_id").in("proposal_id", proposalIds),
    ]);
    const proposalError = proposalsResult.error
      ?? legacyProgramsResult.error
      ?? (profilesResult.error && !isMissingOptionalPhase2Relation(profilesResult.error) ? profilesResult.error : null);
    if (proposalError) {
      console.error("[ai-recommendations] proposal coverage query failed", { code: proposalError.code });
      return NextResponse.json({ error: "Unable to evaluate proposal coverage" }, { status: 500 });
    }

    for (const proposal of proposalsResult.data ?? []) proposalStatuses.set(proposal.id, proposal.status);
    for (const profile of profilesResult.data ?? []) proposalStatuses.set(profile.proposal_id, profile.workflow_status);
    for (const program of legacyProgramsResult.data ?? []) {
      if (!program.proposal_id) continue;
      proposalIdsByNeed.forEach((linkedProposals, needId) => {
        if (!linkedProposals.has(program.proposal_id)) return;
        addToSetMap(programIdsByNeed, needId, program.id);
        addCoverage(
          programCoverageByNeed,
          needId,
          program.id,
          proposalCoverageByNeed.get(needId)?.get(program.proposal_id) ?? "partial",
        );
      });
    }
  }

  const allProgramIds = Array.from(new Set(Array.from(programIdsByNeed.values()).flatMap((ids) => Array.from(ids))));
  const programStatuses = new Map<string, string>();
  if (allProgramIds.length > 0) {
    const { data, error } = await admin.from("programs").select("id,status").in("id", allProgramIds);
    if (error) {
      console.error("[ai-recommendations] program coverage query failed", { code: error.code });
      return NextResponse.json({ error: "Unable to evaluate program coverage" }, { status: 500 });
    }
    for (const program of data ?? []) programStatuses.set(program.id, program.status);
  }

  const result = buildAdvisoryRecommendations({
    barangayId: parsed.data.barangay_id ?? null,
    needs: (needRows ?? []).map((need) => {
      const relatedProposalIds = proposalIdsByNeed.get(need.id) ?? new Set<string>();
      const relatedProgramIds = programIdsByNeed.get(need.id) ?? new Set<string>();
      const activeProgramIds = Array.from(relatedProgramIds).filter((id) => ACTIVE_PROGRAM_STATUSES.has(programStatuses.get(id) ?? ""));
      const barangay = need.barangays as unknown as { name: string } | null;
      const profiling = profilingByBarangay.get(need.barangay_id);
      const needCell = profiling?.aggregate.cells.find((cell) => cell.dimension === "needs" && cell.key === need.category) ?? null;
      const historicalBenchmark = historyByCategory.get(need.category);
      return {
        id: need.id,
        barangayId: need.barangay_id,
        barangayName: barangay?.name ?? "Unassigned barangay",
        category: need.category,
        priorityScore: need.priority_score === null ? null : Number(need.priority_score),
        status: need.status,
        identifiedDate: need.identified_date,
        plannedProposalCount: Array.from(relatedProposalIds).filter((id) => PLANNED_PROPOSAL_STATUSES.has(proposalStatuses.get(id) ?? "")).length,
        activeProgramCount: activeProgramIds.length,
        activeFullProgramCount: activeProgramIds.filter((id) => programCoverageByNeed.get(need.id)?.get(id) === "full").length,
        completedProgramCount: Array.from(relatedProgramIds).filter((id) => programStatuses.get(id) === "completed").length,
        profilingEvidence: profiling ? {
          evidenceSnapshotId: profiling.snapshotId,
          cycleId: profiling.aggregate.cycle.id,
          cycleName: profiling.aggregate.cycle.name,
          reportingDate: profiling.aggregate.cycle.reportingDate,
          sampleMethod: profiling.aggregate.sample.method,
          approvedHouseholds: profiling.aggregate.sample.approvedHouseholds,
          approvedResidents: profiling.aggregate.sample.approvedResidents,
          coveragePercent: profiling.aggregate.sample.coveragePercent,
          responseRatePercent: profiling.aggregate.sample.responseRatePercent,
          needCount: needCell?.count ?? null,
          dataQuality: profiling.aggregate.dataQuality,
        } : null,
        historicalBenchmark: historicalBenchmark ? {
          matchedRecords: historicalBenchmark.matchedRecords,
          budgetTotals: historicalBenchmark.budgetTotals,
          volunteerCounts: historicalBenchmark.volunteerCounts,
          windowStart: historyWindowStart,
          asOfDate: historyAsOfDate,
        } : null,
      };
    }),
  });

  const auditWritten = await recordAudit({
    user_id: auth.actor.id,
    user_email: auth.actor.email,
    action: "ai.advisory_recommendations.read",
    resource_type: "community_need_aggregate",
    resource_id: parsed.data.barangay_id ?? undefined,
    metadata: {
      scope: parsed.data.barangay_id ? "barangay" : "all_authorized",
      approved_open_needs: result.summary.approvedOpenNeeds,
      recommendations: result.summary.recommendationCount,
      schema: result.schema,
    },
  });
  if (!auditWritten) return NextResponse.json({ error: "Unable to audit recommendation access" }, { status: 503 });

  return NextResponse.json(
    { data: result },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
