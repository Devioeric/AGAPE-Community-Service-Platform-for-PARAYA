import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import {
  advisoryRecommendationResponseSchema,
  buildAdvisoryRecommendations,
  recommendationDismissalReasonSchema,
  type AdvisoryPartnerCandidateInput,
} from "@/lib/ai/advisory-recommendations";
import {
  getRecommendationAutomationMode,
  isRecommendationAutomationEnabled,
  recommendationNotificationSyncResultSchema,
} from "@/lib/ai/recommendation-automation";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { requireCronAuth } from "@/lib/cron-auth";
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

type StoredRecommendationReview = {
  need_id: string;
  event_sequence: number;
  recommendation_fingerprint: string;
  action: "endorsed" | "dismissed";
  reason_code: string | null;
  actor_id: string;
  created_at: string;
};

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

type ProposalPlanningLink = {
  id: string;
  needId: string;
  proposalId: string;
  plannedBeneficiaryCount: number | null;
};

type PartnerEntityRow = {
  id: string;
  code: string;
  name: string;
  entity_type: AdvisoryPartnerCandidateInput["entityType"];
  barangay_id: string | null;
};

type PartnershipTermRow = {
  id: string;
  partner_id: string;
  status: AdvisoryPartnerCandidateInput["relationshipStatus"];
  starts_on: string;
  expires_on: string | null;
  agreement_document_id: string | null;
  agreement_exception_reason: string | null;
  agreement_exception_due_on: string | null;
};

function positiveIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

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
  const requestUrl = new URL(request.url);
  const scheduled = requestUrl.searchParams.get("scheduled") === "true";
  const automationMode = getRecommendationAutomationMode();
  if (scheduled) {
    const denied = requireCronAuth(request);
    if (denied) return denied;
    if (Array.from(requestUrl.searchParams.keys()).some((key) => key !== "scheduled")) {
      return NextResponse.json({ error: "Scheduled refresh does not accept filters" }, { status: 400 });
    }
    if (!isRecommendationAutomationEnabled()) {
      return NextResponse.json({ data: { skipped: true, reason: "recommendation_automation_disabled" } });
    }
  }

  const auth = scheduled ? null : await authorizeCapability("analytics.aggregate.read");
  if (auth && !auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!scheduled && (!auth || !auth.ok || !hasCapability(auth.actor.role, auth.actor.permissions, "ai.assist"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawQuery = scheduled ? {} : queryObject(requestUrl.searchParams);
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json({ error: "Only one valid barangay_id may be supplied" }, { status: 400 });
  }

  const admin = createAdminClient();
  let sufficientCoveragePercent = 80;
  let recommendationSettingsRowVersion: number | null = null;
  let recommendationSettingsSource: "database" | "safe_default" = "safe_default";
  const settingsResult = await admin
    .from("ai_recommendation_settings")
    .select("sufficient_coverage_percent,row_version")
    .eq("id", true)
    .maybeSingle();
  if (settingsResult.error && !isMissingOptionalPhase2Relation(settingsResult.error)) {
    console.error("[ai-recommendations] settings query failed", { code: settingsResult.error.code });
    return NextResponse.json({ error: "Unable to load recommendation settings" }, { status: 500 });
  }
  if (settingsResult.data) {
    const threshold = Number(settingsResult.data.sufficient_coverage_percent);
    const version = Number(settingsResult.data.row_version);
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100 || !Number.isInteger(version) || version < 1) {
      return NextResponse.json({ error: "Recommendation settings are invalid" }, { status: 500 });
    }
    sufficientCoveragePercent = threshold;
    recommendationSettingsRowVersion = version;
    recommendationSettingsSource = "database";
  }
  let needsQuery = admin
    .from("community_needs")
    .select("id,barangay_id,category,priority_score,status,identified_date,barangays!inner(name,is_synthetic_test)")
    .eq("approval_status", "approved")
    .neq("status", "addressed")
    .order("priority_score", { ascending: false, nullsFirst: false })
    .limit(500);
  if (parsed.data.barangay_id) needsQuery = needsQuery.eq("barangay_id", parsed.data.barangay_id);
  if (scheduled) needsQuery = needsQuery.eq("barangays.is_synthetic_test", automationMode === "synthetic");

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
  const recentProgramWindowStartDate = new Date(`${historyAsOfDate}T00:00:00.000Z`);
  recentProgramWindowStartDate.setUTCMonth(recentProgramWindowStartDate.getUTCMonth() - 24);
  const recentProgramWindowStart = recentProgramWindowStartDate.toISOString().slice(0, 10);
  const historyByCategory = new Map<string, { matchedRecords: number; budgetTotals: number[]; volunteerCounts: number[] }>();
  const verifiedHistoryCategoryById = new Map<string, string>();
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
        .select("id,category,budget_total,volunteer_count,quality,status,starts_on,data_mode")
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
        verifiedHistoryCategoryById.set(row.id, row.category);
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
  const localCapacityByBarangay = new Map<string, {
    skillCategories: Array<{ category: "trade" | "education" | "health" | "agriculture" | "technology" | "other"; practitionerCount: number }>;
    assetCategories: Array<{ type: "facility" | "equipment" | "natural" | "infrastructure" | "other"; usableQuantity: number }>;
    asOfDate: string;
  }>();
  if (barangayIds.length > 0) {
    const [skillsResult, assetsResult] = await Promise.all([
      admin.from("barangay_skills").select("barangay_id,category,practitioner_count").in("barangay_id", barangayIds).limit(5_000),
      admin.from("barangay_assets").select("barangay_id,asset_type,quantity,condition").in("barangay_id", barangayIds).limit(5_000),
    ]);
    if (skillsResult.error || assetsResult.error) {
      console.error("[ai-recommendations] local capacity aggregate query failed", { code: skillsResult.error?.code ?? assetsResult.error?.code });
    } else {
      const skillCounts = new Map<string, Map<string, number>>();
      const assetCounts = new Map<string, Map<string, number>>();
      for (const row of skillsResult.data ?? []) {
        const categories = skillCounts.get(row.barangay_id) ?? new Map<string, number>();
        const count = Number(row.practitioner_count);
        if (Number.isInteger(count) && count >= 0) categories.set(row.category, (categories.get(row.category) ?? 0) + count);
        skillCounts.set(row.barangay_id, categories);
      }
      for (const row of assetsResult.data ?? []) {
        if (!(["excellent", "good", "fair"] as const).includes(row.condition)) continue;
        const categories = assetCounts.get(row.barangay_id) ?? new Map<string, number>();
        const count = Number(row.quantity);
        if (Number.isInteger(count) && count >= 0) categories.set(row.asset_type, (categories.get(row.asset_type) ?? 0) + count);
        assetCounts.set(row.barangay_id, categories);
      }
      for (const barangayId of barangayIds) {
        localCapacityByBarangay.set(barangayId, {
          skillCategories: Array.from(skillCounts.get(barangayId) ?? []).map(([category, practitionerCount]) => ({
            category: category as "trade" | "education" | "health" | "agriculture" | "technology" | "other",
            practitionerCount,
          })),
          assetCategories: Array.from(assetCounts.get(barangayId) ?? []).map(([type, usableQuantity]) => ({
            type: type as "facility" | "equipment" | "natural" | "infrastructure" | "other",
            usableQuantity,
          })),
          asOfDate: historyAsOfDate,
        });
      }
    }
  }
  const proposalIdsByNeed = new Map<string, Set<string>>();
  const programIdsByNeed = new Map<string, Set<string>>();
  const proposalCoverageByNeed = new Map<string, Map<string, CoverageLevel>>();
  const programCoverageByNeed = new Map<string, Map<string, CoverageLevel>>();
  const proposalPlanningLinksByNeed = new Map<string, ProposalPlanningLink[]>();
  const proposalPlanningLinksById = new Map<string, ProposalPlanningLink>();
  const sourceProposalLinkByNeedAndProgram = new Map<string, string>();

  if (needIds.length > 0) {
    const [v2ProposalLinks, legacyProposalLinks, v2ProgramLinks] = await Promise.all([
      admin.from("proposal_need_links_v2").select("id,need_id,proposal_id,intended_coverage,planned_beneficiary_count,planned_beneficiary_percentage").in("need_id", needIds),
      admin.from("proposal_validation_links").select("source_id,proposal_id").eq("source_type", "community_need").in("source_id", needIds),
      admin.from("program_need_links_v2").select("need_id,program_id,intended_coverage,source_proposal_need_link_id").in("need_id", needIds),
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
      const planningLink: ProposalPlanningLink = {
        id: link.id,
        needId: link.need_id,
        proposalId: link.proposal_id,
        plannedBeneficiaryCount: positiveIntegerOrNull(link.planned_beneficiary_count),
      };
      proposalPlanningLinksById.set(planningLink.id, planningLink);
      proposalPlanningLinksByNeed.set(
        planningLink.needId,
        [...(proposalPlanningLinksByNeed.get(planningLink.needId) ?? []), planningLink],
      );
    }
    for (const link of legacyProposalLinks.data ?? []) addToSetMap(proposalIdsByNeed, link.source_id, link.proposal_id);
    for (const link of v2ProgramLinks.data ?? []) {
      addToSetMap(programIdsByNeed, link.need_id, link.program_id);
      addCoverage(programCoverageByNeed, link.need_id, link.program_id, link.intended_coverage === "full" ? "full" : "partial");
      if (link.source_proposal_need_link_id) {
        sourceProposalLinkByNeedAndProgram.set(`${link.need_id}:${link.program_id}`, link.source_proposal_need_link_id);
      }
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
  const programEndDates = new Map<string, string | null>();
  if (allProgramIds.length > 0) {
    const { data, error } = await admin.from("programs").select("id,status,end_date").in("id", allProgramIds);
    if (error) {
      console.error("[ai-recommendations] program coverage query failed", { code: error.code });
      return NextResponse.json({ error: "Unable to evaluate program coverage" }, { status: 500 });
    }
    for (const program of data ?? []) {
      programStatuses.set(program.id, program.status);
      programEndDates.set(program.id, program.end_date);
    }
  }

  let partnershipAvailability: "available" | "component_disabled" | "runtime_off" | "unavailable" =
    isPhase2ComponentEnabled("partners") ? "unavailable" : "component_disabled";
  const partnerCandidatesByNeed = new Map<string, AdvisoryPartnerCandidateInput[]>();
  if (isPhase2ComponentEnabled("partners")) {
    const runtimeResult = await admin
      .from("phase2_component_runtime")
      .select("mode")
      .eq("component", "partners")
      .maybeSingle();
    if (runtimeResult.error) {
      console.error("[ai-recommendations] Partner advisory runtime query failed", { code: runtimeResult.error.code });
    } else if (runtimeResult.data?.mode !== "synthetic" && runtimeResult.data?.mode !== "live") {
      partnershipAvailability = "runtime_off";
    } else {
      const partnerMode = runtimeResult.data.mode;
      const [entitiesResult, termsResult, policiesResult, needLinksResult, programPartnersResult, historyPartnersResult, outcomesResult] = await Promise.all([
        admin
          .from("partner_entities")
          .select("id,code,name,entity_type,barangay_id")
          .eq("data_mode", partnerMode)
          .eq("lifecycle", "active")
          .order("name")
          .limit(1_000),
        admin
          .from("partnership_terms")
          .select("id,partner_id,status,starts_on,expires_on,agreement_document_id,agreement_exception_reason,agreement_exception_due_on")
          .order("starts_on", { ascending: false })
          .limit(2_000),
        admin
          .from("partner_type_policies")
          .select("entity_type,agreement_required,effective_from")
          .lte("effective_from", historyAsOfDate)
          .order("effective_from", { ascending: false })
          .limit(100),
        needIds.length > 0
          ? admin.from("partnership_need_links").select("term_id,need_id,coverage").in("need_id", needIds).limit(5_000)
          : Promise.resolve({ data: [], error: null }),
        allProgramIds.length > 0
          ? admin.from("program_partner_links").select("program_id,partner_id").in("program_id", allProgramIds).limit(5_000)
          : Promise.resolve({ data: [], error: null }),
        verifiedHistoryCategoryById.size > 0
          ? admin.from("historical_program_partner_links").select("historical_program_id,partner_id").in("historical_program_id", Array.from(verifiedHistoryCategoryById.keys())).limit(5_000)
          : Promise.resolve({ data: [], error: null }),
        allProgramIds.length > 0
          ? admin.from("impact_indicators").select("id,program_id").in("program_id", allProgramIds).is("voided_at", null).limit(10_000)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const partnerError = entitiesResult.error
        ?? termsResult.error
        ?? policiesResult.error
        ?? needLinksResult.error
        ?? programPartnersResult.error
        ?? historyPartnersResult.error
        ?? outcomesResult.error;
      if (partnerError) {
        console.error("[ai-recommendations] Partner advisory aggregate query failed", { code: partnerError.code });
      } else {
        partnershipAvailability = "available";
        const entities = (entitiesResult.data ?? []) as PartnerEntityRow[];
        const entityById = new Map(entities.map((entity) => [entity.id, entity]));
        const termById = new Map<string, PartnershipTermRow>();
        const latestTermByPartner = new Map<string, PartnershipTermRow>();
        for (const term of (termsResult.data ?? []) as PartnershipTermRow[]) {
          if (!entityById.has(term.partner_id)) continue;
          termById.set(term.id, term);
          if (!latestTermByPartner.has(term.partner_id)) latestTermByPartner.set(term.partner_id, term);
        }
        const agreementRequiredByType = new Map<string, boolean>();
        for (const policy of policiesResult.data ?? []) {
          if (!agreementRequiredByType.has(policy.entity_type)) {
            agreementRequiredByType.set(policy.entity_type, policy.agreement_required === true);
          }
        }
        const needCoverageByPartner = new Map<string, AdvisoryPartnerCandidateInput["needCoverage"]>();
        for (const link of needLinksResult.data ?? []) {
          const partnerId = termById.get(link.term_id)?.partner_id;
          if (!partnerId || !entityById.has(partnerId)) continue;
          const key = `${link.need_id}:${partnerId}`;
          const current = needCoverageByPartner.get(key);
          const next = link.coverage as AdvisoryPartnerCandidateInput["needCoverage"];
          const priority = { unaddressed: 3, partial: 2, addressed: 1 } as const;
          if (!current || (next && priority[next] > priority[current])) needCoverageByPartner.set(key, next);
        }
        const programIdsByPartner = new Map<string, Set<string>>();
        for (const link of programPartnersResult.data ?? []) {
          if (!entityById.has(link.partner_id)) continue;
          addToSetMap(programIdsByPartner, link.partner_id, link.program_id);
        }
        const outcomeCountByProgram = new Map<string, number>();
        for (const outcome of outcomesResult.data ?? []) {
          outcomeCountByProgram.set(outcome.program_id, (outcomeCountByProgram.get(outcome.program_id) ?? 0) + 1);
        }
        const historyCategoryCountByPartner = new Map<string, Map<string, number>>();
        for (const link of historyPartnersResult.data ?? []) {
          if (!entityById.has(link.partner_id)) continue;
          const category = verifiedHistoryCategoryById.get(link.historical_program_id);
          if (!category) continue;
          const counts = historyCategoryCountByPartner.get(link.partner_id) ?? new Map<string, number>();
          counts.set(category, (counts.get(category) ?? 0) + 1);
          historyCategoryCountByPartner.set(link.partner_id, counts);
        }

        for (const need of needRows ?? []) {
          const relevantProgramIds = programIdsByNeed.get(need.id) ?? new Set<string>();
          const candidates = entities.map((entity): AdvisoryPartnerCandidateInput => {
            const latestTerm = latestTermByPartner.get(entity.id);
            const agreementRequired = agreementRequiredByType.get(entity.entity_type) ?? true;
            const agreementReadiness = !agreementRequired
              ? "not_required" as const
              : latestTerm?.agreement_document_id
                ? "documented" as const
                : latestTerm?.agreement_exception_reason
                  && latestTerm.agreement_exception_due_on
                  && latestTerm.agreement_exception_due_on >= historyAsOfDate
                  ? "director_exception" as const
                  : "incomplete" as const;
            const partnerPrograms = programIdsByPartner.get(entity.id) ?? new Set<string>();
            const relatedProgramCount = Array.from(partnerPrograms).filter((programId) => relevantProgramIds.has(programId)).length;
            const recordedOutcomeCount = Array.from(partnerPrograms)
              .filter((programId) => relevantProgramIds.has(programId))
              .reduce((total, programId) => total + (outcomeCountByProgram.get(programId) ?? 0), 0);
            return {
              id: entity.id,
              code: entity.code,
              name: entity.name,
              entityType: entity.entity_type,
              isHostBarangay: entity.barangay_id === need.barangay_id,
              relationshipStatus: latestTerm?.status ?? "none",
              expiresOn: latestTerm?.expires_on ?? null,
              agreementReadiness,
              needCoverage: needCoverageByPartner.get(`${need.id}:${entity.id}`) ?? null,
              relatedProgramCount,
              recordedOutcomeCount,
              categoryMatchedVerifiedHistoryCount: historyCategoryCountByPartner.get(entity.id)?.get(need.category) ?? 0,
            };
          });
          partnerCandidatesByNeed.set(need.id, candidates);
        }
      }
    }
  }

  const generated = buildAdvisoryRecommendations({
    barangayId: parsed.data.barangay_id ?? null,
    sufficientCoveragePercent,
    recommendationSettingsRowVersion,
    recommendationSettingsSource,
    needs: (needRows ?? []).map((need) => {
      const relatedProposalIds = proposalIdsByNeed.get(need.id) ?? new Set<string>();
      const relatedProgramIds = programIdsByNeed.get(need.id) ?? new Set<string>();
      const activeProgramIds = Array.from(relatedProgramIds).filter((id) => ACTIVE_PROGRAM_STATUSES.has(programStatuses.get(id) ?? ""));
      const completedProgramIds = Array.from(relatedProgramIds).filter((id) => programStatuses.get(id) === "completed");
      const recentCompletedProgramCount = completedProgramIds.filter((id) => {
        const endDate = programEndDates.get(id);
        return Boolean(endDate && endDate >= recentProgramWindowStart && endDate <= historyAsOfDate);
      }).length;
      const barangay = need.barangays as unknown as { name: string } | null;
      const profiling = profilingByBarangay.get(need.barangay_id);
      const needCell = profiling?.aggregate.cells.find((cell) => cell.dimension === "needs" && cell.key === need.category) ?? null;
      const historicalBenchmark = historyByCategory.get(need.category);
      const plannedBeneficiaryCounts = (proposalPlanningLinksByNeed.get(need.id) ?? [])
        .filter((link) => PLANNED_PROPOSAL_STATUSES.has(proposalStatuses.get(link.proposalId) ?? ""))
        .map((link) => link.plannedBeneficiaryCount)
        .filter((count): count is number => count !== null);
      for (const programId of activeProgramIds) {
        const sourceLinkId = sourceProposalLinkByNeedAndProgram.get(`${need.id}:${programId}`);
        const sourceLink = sourceLinkId ? proposalPlanningLinksById.get(sourceLinkId) : null;
        if (sourceLink?.plannedBeneficiaryCount) plannedBeneficiaryCounts.push(sourceLink.plannedBeneficiaryCount);
      }
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
        completedProgramCount: completedProgramIds.length,
        recentCompletedProgramCount,
        largestLinkedPlannedBeneficiaryCount: plannedBeneficiaryCounts.length > 0
          ? Math.max(...plannedBeneficiaryCounts)
          : null,
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
        localCapacity: localCapacityByBarangay.get(need.barangay_id) ?? null,
        partnershipAvailability,
        partnerCandidates: partnerCandidatesByNeed.get(need.id) ?? [],
      };
    }),
  });

  const latestReviewByNeed = new Map<string, StoredRecommendationReview>();
  const reviewActorNames = new Map<string, string>();
  const recommendationNeedIds = generated.recommendations.map((recommendation) => recommendation.needId);
  if (recommendationNeedIds.length > 0) {
    const reviewsResult = await admin
      .from("ai_recommendation_reviews")
      .select("need_id,event_sequence,recommendation_fingerprint,action,reason_code,actor_id,created_at")
      .in("need_id", recommendationNeedIds)
      .order("event_sequence", { ascending: false })
      .limit(1_000);
    if (reviewsResult.error && !isMissingOptionalPhase2Relation(reviewsResult.error)) {
      console.error("[ai-recommendations] review-state query failed", { code: reviewsResult.error.code });
      return NextResponse.json({ error: "Unable to load recommendation review state" }, { status: 500 });
    }
    for (const row of (reviewsResult.data ?? []) as StoredRecommendationReview[]) {
      if (!latestReviewByNeed.has(row.need_id)) latestReviewByNeed.set(row.need_id, row);
    }
    const actorIds = Array.from(new Set(Array.from(latestReviewByNeed.values()).map((review) => review.actor_id)));
    if (actorIds.length > 0) {
      const actorsResult = await admin.from("users").select("id,full_name").in("id", actorIds);
      if (actorsResult.error) {
        console.error("[ai-recommendations] review-actor query failed", { code: actorsResult.error.code });
        return NextResponse.json({ error: "Unable to load recommendation review state" }, { status: 500 });
      }
      for (const actor of actorsResult.data ?? []) reviewActorNames.set(actor.id, actor.full_name);
    }
  }

  const result = advisoryRecommendationResponseSchema.parse({
    ...generated,
    scope: {
      ...generated.scope,
      canReview: auth?.ok
        ? hasCapability(auth.actor.role, auth.actor.permissions, "ai.recommendation.review")
        : false,
      canConfigureThreshold: auth?.ok
        ? hasCapability(auth.actor.role, auth.actor.permissions, "ai.recommendation.configure")
        : false,
    },
    recommendations: generated.recommendations.map((recommendation) => {
      const storedReview = latestReviewByNeed.get(recommendation.needId);
      if (!storedReview) return recommendation;
      const actorName = reviewActorNames.get(storedReview.actor_id);
      const isCurrent = storedReview.recommendation_fingerprint === recommendation.recommendationFingerprint;
      return {
        ...recommendation,
        review: {
          status: isCurrent ? storedReview.action : "stale",
          lastAction: storedReview.action,
          reasonCode: storedReview.reason_code && recommendationDismissalReasonSchema.safeParse(storedReview.reason_code).success
            ? storedReview.reason_code
            : null,
          reviewedAt: storedReview.created_at,
          reviewedBy: actorName ? { id: storedReview.actor_id, name: actorName } : null,
        },
      };
    }),
  });

  if (scheduled) {
    const syncResult = await admin.rpc("phase3_sync_recommendation_notifications", {
      p_mode: automationMode,
      p_recommendations: result.recommendations.filter((recommendation) => recommendation.automation.eligible).map((recommendation) => ({
        needId: recommendation.needId,
        recommendationFingerprint: recommendation.recommendationFingerprint,
        priorityLabel: recommendation.priority.label,
      })),
    });
    if (syncResult.error) {
      console.error("[ai-recommendations] scheduled notification sync failed", { code: syncResult.error.code });
      return NextResponse.json({ error: "Unable to synchronize recommendation notices" }, { status: 500 });
    }
    const sync = recommendationNotificationSyncResultSchema.safeParse(syncResult.data);
    if (!sync.success) {
      return NextResponse.json({ error: "Recommendation notification result was invalid" }, { status: 500 });
    }
    return NextResponse.json({
      data: {
        skipped: false,
        mode: automationMode,
        recommendationCount: result.summary.recommendationCount,
        automatedAlertCandidates: result.summary.automatedAlertCandidates,
        ...sync.data,
      },
    });
  }

  if (!auth || !auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
