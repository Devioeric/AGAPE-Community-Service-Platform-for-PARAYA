import { createHash } from "node:crypto";
import { z } from "zod";

export const needCategorySchema = z.enum([
  "health",
  "livelihood",
  "education",
  "infrastructure",
  "environment",
]);

const evidenceCountSchema = z.discriminatedUnion("suppressed", [
  z.object({ suppressed: z.literal(false), value: z.number().int().nonnegative(), label: z.string().regex(/^\d+$/) }).strict(),
  z.object({ suppressed: z.literal(true), value: z.null(), label: z.string().regex(/^(suppressed|<([5-9]|[1-9][0-9]|100))$/) }).strict(),
]);

export const advisoryProfilingEvidenceSchema = z.object({
  evidenceSnapshotId: z.string().uuid(),
  cycleId: z.string().uuid(),
  cycleName: z.string().trim().min(2).max(160),
  reportingDate: z.string().date(),
  sampleMethod: z.string().trim().min(2).max(160),
  approvedHouseholds: z.number().int().nonnegative(),
  approvedResidents: z.number().int().nonnegative(),
  coveragePercent: z.number().min(0).max(100).nullable(),
  responseRatePercent: z.number().min(0).max(100).nullable(),
  needCount: evidenceCountSchema.nullable(),
  dataQuality: z.object({
    pendingPackages: z.number().int().nonnegative(),
    returnedPackages: z.number().int().nonnegative(),
    excludedPackages: z.number().int().nonnegative(),
    unresolvedDuplicates: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const advisoryHistoricalBenchmarkInputSchema = z.object({
  matchedRecords: z.number().int().nonnegative(),
  budgetTotals: z.array(z.number().nonnegative()).max(500),
  volunteerCounts: z.array(z.number().int().nonnegative()).max(500),
  windowStart: z.string().date(),
  asOfDate: z.string().date(),
}).strict();

export const advisoryNeedInputSchema = z.object({
  id: z.string().uuid(),
  barangayId: z.string().uuid(),
  barangayName: z.string().trim().min(1).max(160),
  category: needCategorySchema,
  priorityScore: z.number().min(1).max(5).nullable(),
  status: z.enum(["identified", "in_progress"]),
  identifiedDate: z.string().date(),
  plannedProposalCount: z.number().int().nonnegative(),
  activeProgramCount: z.number().int().nonnegative(),
  activeFullProgramCount: z.number().int().nonnegative(),
  completedProgramCount: z.number().int().nonnegative(),
  largestLinkedPlannedBeneficiaryCount: z.number().int().positive().nullable(),
  profilingEvidence: advisoryProfilingEvidenceSchema.nullable(),
  historicalBenchmark: advisoryHistoricalBenchmarkInputSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.activeFullProgramCount > value.activeProgramCount) {
    ctx.addIssue({ code: "custom", message: "Full active coverage cannot exceed all active coverage" });
  }
});

const interventionSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{2,79}$/),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  suggestedSdgs: z.array(z.number().int().min(1).max(17)).min(1).max(5),
}).strict();

const resourceSchema = z.object({
  category: z.enum(["coordination", "people", "materials", "venue", "technical_support"]),
  item: z.string().trim().min(1).max(160),
  indicativeQuantity: z.string().trim().min(1).max(120),
  limitation: z.string().trim().min(1).max(240),
}).strict();

export const recommendationDismissalReasonSchema = z.enum([
  "insufficient_evidence",
  "duplicate_or_covered",
  "outside_current_scope",
  "data_quality_concern",
  "defer_until_next_cycle",
]);

const recommendationReviewSchema = z.object({
  status: z.enum(["open", "endorsed", "dismissed", "stale"]),
  lastAction: z.enum(["endorsed", "dismissed"]).nullable(),
  reasonCode: recommendationDismissalReasonSchema.nullable(),
  reviewedAt: z.string().datetime({ offset: true }).nullable(),
  reviewedBy: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
  }).strict().nullable(),
}).strict();

const beneficiaryGuidanceSchema = z.object({
  categoryCode: needCategorySchema,
  segmentLabel: z.string().trim().min(1).max(200),
  suggestedCount: z.number().int().positive().nullable(),
  source: z.enum(["approved_profile_aggregate", "approved_need_only"]),
  asOfDate: z.string().date(),
  confidence: z.enum(["moderate", "limited", "unavailable"]),
  limitation: z.string().trim().min(1).max(500),
}).strict();

export const advisoryRecommendationSchema = z.object({
  needId: z.string().uuid(),
  recommendationFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  barangay: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
  }).strict(),
  category: needCategorySchema,
  priority: z.object({
    score: z.number().min(1).max(5),
    label: z.enum(["critical", "high", "medium", "low"]),
  }).strict(),
  coverage: z.object({
    state: z.enum(["unaddressed", "planned", "partial_active"]),
    plannedProposals: z.number().int().nonnegative(),
    activePrograms: z.number().int().nonnegative(),
    activeFullPrograms: z.number().int().nonnegative(),
    activePartialPrograms: z.number().int().nonnegative(),
    completedPrograms: z.number().int().nonnegative(),
    estimate: z.object({
      status: z.enum(["available", "suppressed", "unavailable"]),
      affectedCount: evidenceCountSchema.nullable(),
      plannedCount: z.number().int().positive().nullable(),
      estimatedPercent: z.number().min(0).max(100).nullable(),
      confidence: z.enum(["moderate", "limited", "unavailable"]),
      limitation: z.string().trim().min(1).max(500),
    }).strict(),
  }).strict(),
  beneficiaryGuidance: beneficiaryGuidanceSchema,
  action: z.enum(["develop_response", "review_planned_response", "review_active_gap"]),
  intervention: z.object({
    code: z.string().regex(/^[a-z][a-z0-9_]{2,79}$/),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
  }).strict(),
  alternatives: z.array(interventionSchema).min(2).max(3),
  indicativeResources: z.array(resourceSchema).min(1).max(8),
  planningBenchmarks: z.object({
    source: z.literal("verified_historical_programs"),
    matchedRecords: z.number().int().nonnegative(),
    windowStart: z.string().date().nullable(),
    asOfDate: z.string().date(),
    budgetRange: z.object({ low: z.string().regex(/^\d+\.\d{2}$/), high: z.string().regex(/^\d+\.\d{2}$/), currency: z.literal("PHP") }).strict().nullable(),
    volunteerRange: z.object({ low: z.number().int().nonnegative(), high: z.number().int().nonnegative() }).strict().nullable(),
    confidence: z.enum(["moderate", "limited", "unavailable"]),
    limitation: z.string().trim().min(1).max(500),
  }).strict(),
  suggestedSdgs: z.array(z.number().int().min(1).max(17)).min(1).max(5),
  rationale: z.string().trim().min(1).max(500),
  confidence: z.enum(["high", "medium"]),
  evidence: z.object({
    source: z.literal("approved_community_need"),
    identifiedDate: z.string().date(),
    quality: z.literal("approved"),
    profiling: advisoryProfilingEvidenceSchema.nullable(),
  }).strict(),
  review: recommendationReviewSchema,
}).strict();

export const advisoryRecommendationResponseSchema = z.object({
  schema: z.literal("agape.ai.need-recommendations.v2"),
  generatedAt: z.string().datetime(),
  advisoryOnly: z.literal(true),
  scope: z.object({
    barangayId: z.string().uuid().nullable(),
    source: z.literal("approved_community_needs"),
    asOfDate: z.string().date(),
    canReview: z.boolean(),
  }).strict(),
  summary: z.object({
    approvedOpenNeeds: z.number().int().nonnegative(),
    unaddressedNeeds: z.number().int().nonnegative(),
    needsWithPlannedResponses: z.number().int().nonnegative(),
    needsWithActivePrograms: z.number().int().nonnegative(),
    needsWithPartialActiveCoverage: z.number().int().nonnegative(),
    needsWithFullActiveCoverage: z.number().int().nonnegative(),
    recommendationCount: z.number().int().nonnegative(),
  }).strict(),
  recommendations: z.array(advisoryRecommendationSchema).max(100),
}).strict();

export type AdvisoryNeedInput = z.infer<typeof advisoryNeedInputSchema>;
export type AdvisoryRecommendationResponse = z.infer<typeof advisoryRecommendationResponseSchema>;

type InterventionRule = {
  code: string;
  title: string;
  description: string;
  sdgs: number[];
};

type ResourceRule = z.infer<typeof resourceSchema>;

type RecommendationRule = {
  alternatives: [InterventionRule, InterventionRule, InterventionRule];
  resources: ResourceRule[];
};

const INTERVENTIONS: Record<z.infer<typeof needCategorySchema>, RecommendationRule> = {
  health: {
    alternatives: [
      { code: "community_health_outreach", title: "Community health assessment and outreach", description: "Validate the priority with local health partners, then prepare a focused prevention, referral, and education activity.", sdgs: [3] },
      { code: "health_education_sessions", title: "Preventive health education sessions", description: "Deliver a short series of locally validated health-learning sessions with referral guidance and outcome checks.", sdgs: [3, 4] },
      { code: "health_referral_coordination", title: "Community health referral coordination", description: "Strengthen the referral pathway between residents, barangay focal persons, and qualified health providers without collecting clinical records.", sdgs: [3, 17] },
    ],
    resources: [
      { category: "coordination", item: "Barangay and health-provider coordination group", indicativeQuantity: "1 working group", limitation: "Membership requires human confirmation." },
      { category: "people", item: "Qualified facilitators and referral focal persons", indicativeQuantity: "At least 2 roles", limitation: "Credentials and availability require validation." },
      { category: "materials", item: "Reviewed health-learning and referral materials", indicativeQuantity: "1 activity set", limitation: "Content must be approved by qualified personnel." },
    ],
  },
  livelihood: {
    alternatives: [
      { code: "livelihood_skills_market_linkage", title: "Livelihood skills and market-linkage initiative", description: "Assess participant readiness and connect practical skills development with mentoring, resources, and realistic market opportunities.", sdgs: [1, 8] },
      { code: "enterprise_readiness_workshop", title: "Enterprise readiness workshop", description: "Provide foundational costing, recordkeeping, and market-validation activities before committing capital or equipment.", sdgs: [4, 8] },
      { code: "employment_pathway_coordination", title: "Employment pathway coordination", description: "Coordinate skills mapping, career preparation, and referrals with appropriate employers or training partners.", sdgs: [8, 17] },
    ],
    resources: [
      { category: "people", item: "Skills trainer or enterprise mentor", indicativeQuantity: "1–2 facilitators", limitation: "Expertise must match the validated beneficiary group." },
      { category: "materials", item: "Training and market-validation materials", indicativeQuantity: "1 set per activity", limitation: "Quantities depend on the final participant count." },
      { category: "technical_support", item: "Partner referral or market-linkage support", indicativeQuantity: "At least 1 partner", limitation: "No income outcome is guaranteed." },
    ],
  },
  education: {
    alternatives: [
      { code: "learning_support_intervention", title: "Targeted learning support intervention", description: "Coordinate with education stakeholders to define the learner group, support activity, materials, and measurable learning outputs.", sdgs: [4] },
      { code: "learning_resource_access", title: "Learning resource access activity", description: "Validate priority learning materials and organize equitable access with school or community partners.", sdgs: [4, 10] },
      { code: "digital_learning_readiness", title: "Digital learning readiness support", description: "Assess device, connectivity, and digital-literacy barriers before designing a bounded learning-support activity.", sdgs: [4, 9] },
    ],
    resources: [
      { category: "people", item: "Learning facilitators", indicativeQuantity: "Based on validated group size", limitation: "Safeguarding and eligibility checks remain human responsibilities." },
      { category: "materials", item: "Reviewed learning activity materials", indicativeQuantity: "1 set per learner or group", limitation: "Final quantities depend on the approved beneficiary count." },
      { category: "venue", item: "Accessible learning space", indicativeQuantity: "1 suitable venue", limitation: "Availability and accessibility require local confirmation." },
    ],
  },
  infrastructure: {
    alternatives: [
      { code: "infrastructure_readiness_assessment", title: "Infrastructure readiness and partner assessment", description: "Document the service gap, validate technical feasibility, and identify the government or community partners needed before project design.", sdgs: [9, 11] },
      { code: "minor_facility_improvement", title: "Minor facility improvement activity", description: "Define a small, technically reviewed improvement with clear ownership, maintenance, and safety responsibilities.", sdgs: [9, 11] },
      { code: "public_service_access_mapping", title: "Public service access mapping", description: "Map the service-access gap at an aggregate level and coordinate referrals to the responsible infrastructure authority.", sdgs: [9, 10, 11] },
    ],
    resources: [
      { category: "technical_support", item: "Qualified technical assessor", indicativeQuantity: "At least 1 reviewer", limitation: "AGAPE does not replace engineering or government approval." },
      { category: "coordination", item: "Responsible authority and community coordination", indicativeQuantity: "1 joint review", limitation: "Ownership and maintenance must be confirmed before implementation." },
      { category: "materials", item: "Indicative works or assessment materials", indicativeQuantity: "To be quantified after assessment", limitation: "No construction quantity is inferred automatically." },
    ],
  },
  environment: {
    alternatives: [
      { code: "environmental_resilience_action", title: "Environmental resilience action", description: "Combine community education, local coordination, and a measurable environmental action suited to the approved need category.", sdgs: [6, 11, 13] },
      { code: "waste_reduction_campaign", title: "Waste reduction and segregation campaign", description: "Pair practical education with a measurable local waste-reduction or segregation activity and follow-up check.", sdgs: [11, 12, 13] },
      { code: "community_risk_preparedness", title: "Community environmental risk preparedness", description: "Validate local environmental risks and coordinate a bounded preparedness, mitigation, or information activity.", sdgs: [11, 13] },
    ],
    resources: [
      { category: "coordination", item: "Barangay environmental focal group", indicativeQuantity: "1 working group", limitation: "Local roles and authority require confirmation." },
      { category: "materials", item: "Activity and information materials", indicativeQuantity: "Based on validated activity scope", limitation: "Quantities are not inferred from suppressed cells." },
      { category: "people", item: "Facilitators and community volunteers", indicativeQuantity: "Based on activity area and duration", limitation: "Eligibility and availability must be checked separately." },
    ],
  },
};

function priorityLabel(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 5) return "critical";
  if (score >= 4) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function range(values: number[], minimumEvidence = 2): { low: number; high: number } | null {
  const usable = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (usable.length < minimumEvidence) return null;
  return { low: usable[0], high: usable[usable.length - 1] };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function recommendationFingerprint(value: {
  needId: string;
  category: string;
  priority: { score: number; label: string };
  coverage: Record<string, unknown>;
  beneficiaryGuidance: {
    categoryCode: string;
    suggestedCount: number | null;
    source: string;
    asOfDate: string;
  };
  intervention: { code: string };
  alternatives: Array<{ code: string }>;
  indicativeResources: Array<{ category: string; item: string; indicativeQuantity: string }>;
  planningBenchmarks: {
    matchedRecords: number;
    budgetRange: unknown;
    volunteerRange: unknown;
  };
  suggestedSdgs: number[];
  evidence: {
    identifiedDate: string;
    profiling: { evidenceSnapshotId: string; needCount: unknown } | null;
  };
}): string {
  const materialState = {
    schema: "agape.ai.need-recommendations.v2",
    ruleVersion: 2,
    needId: value.needId,
    category: value.category,
    priority: value.priority,
    coverage: value.coverage,
    beneficiaryGuidance: value.beneficiaryGuidance,
    interventionCode: value.intervention.code,
    alternativeCodes: value.alternatives.map((item) => item.code),
    indicativeResources: value.indicativeResources.map((item) => ({
      category: item.category,
      item: item.item,
      indicativeQuantity: item.indicativeQuantity,
    })),
    planningBenchmarks: {
      matchedRecords: value.planningBenchmarks.matchedRecords,
      budgetRange: value.planningBenchmarks.budgetRange,
      volunteerRange: value.planningBenchmarks.volunteerRange,
    },
    suggestedSdgs: value.suggestedSdgs,
    evidence: {
      identifiedDate: value.evidence.identifiedDate,
      profilingEvidenceSnapshotId: value.evidence.profiling?.evidenceSnapshotId ?? null,
      profilingNeedCount: value.evidence.profiling?.needCount ?? null,
    },
  };
  return createHash("sha256").update(stableJson(materialState)).digest("hex");
}

function buildCoverageEstimate(need: AdvisoryNeedInput) {
  const affectedCount = need.profilingEvidence?.needCount ?? null;
  const plannedCount = need.largestLinkedPlannedBeneficiaryCount;

  if (affectedCount?.suppressed) {
    return {
      status: "suppressed" as const,
      affectedCount,
      plannedCount,
      estimatedPercent: null,
      confidence: "unavailable" as const,
      limitation: "The affected-count cell is suppressed for privacy. No percentage is calculated and no drill-through is available.",
    };
  }

  if (!affectedCount || affectedCount.value === 0 || plannedCount === null) {
    return {
      status: "unavailable" as const,
      affectedCount,
      plannedCount,
      estimatedPercent: null,
      confidence: "unavailable" as const,
      limitation: affectedCount?.value === 0
        ? "The approved aggregate reports no affected records for this category, so a coverage percentage would be misleading."
        : plannedCount === null
          ? "No positive planned beneficiary count is recorded on a linked proposal or active program. No percentage was inferred."
          : "No compatible unsuppressed affected-count cell is available. No percentage was inferred.",
    };
  }

  const quality = need.profilingEvidence?.dataQuality;
  const moderateConfidence = quality
    && quality.pendingPackages === 0
    && quality.returnedPackages === 0
    && quality.unresolvedDuplicates === 0
    && (need.profilingEvidence?.responseRatePercent ?? 0) >= 80;

  return {
    status: "available" as const,
    affectedCount,
    plannedCount,
    estimatedPercent: Math.min(100, Math.round((plannedCount / affectedCount.value) * 1_000) / 10),
    confidence: moderateConfidence ? "moderate" as const : "limited" as const,
    limitation: "This sample-based estimate compares the largest linked plan with the approved affected count. Linked plans are not summed because their beneficiaries may overlap; validate reach before deciding.",
  };
}

const BENEFICIARY_SEGMENT_LABEL: Record<z.infer<typeof needCategorySchema>, string> = {
  health: "Residents represented in the approved health-need aggregate",
  livelihood: "Residents represented in the approved livelihood-need aggregate",
  education: "Learners or residents represented in the approved education-need aggregate",
  infrastructure: "Households or residents represented in the approved infrastructure-need aggregate",
  environment: "Households or residents represented in the approved environment-need aggregate",
};

function buildBeneficiaryGuidance(need: AdvisoryNeedInput) {
  const affectedCount = need.profilingEvidence?.needCount ?? null;
  const hasSafeCount = Boolean(affectedCount && !affectedCount.suppressed && affectedCount.value > 0);
  const quality = need.profilingEvidence?.dataQuality;
  const moderateConfidence = hasSafeCount
    && quality
    && quality.pendingPackages === 0
    && quality.returnedPackages === 0
    && quality.unresolvedDuplicates === 0
    && (need.profilingEvidence?.responseRatePercent ?? 0) >= 80;

  return {
    categoryCode: need.category,
    segmentLabel: BENEFICIARY_SEGMENT_LABEL[need.category],
    suggestedCount: hasSafeCount && affectedCount && !affectedCount.suppressed ? affectedCount.value : null,
    source: hasSafeCount ? "approved_profile_aggregate" as const : "approved_need_only" as const,
    asOfDate: need.profilingEvidence?.reportingDate ?? need.identifiedDate,
    confidence: hasSafeCount ? moderateConfidence ? "moderate" as const : "limited" as const : "unavailable" as const,
    limitation: hasSafeCount
      ? "This count is an editable planning starting point from the approved profiled sample, not a census or promised project reach. Confirm the final target and document any override."
      : affectedCount?.suppressed
        ? "The matching profile count is suppressed for privacy. Enter a human-validated aggregate target and source; no resident drill-through is available."
        : "No compatible approved profile count is available. Enter a human-validated aggregate target and source before submission.",
  };
}

export function buildAdvisoryRecommendations(input: {
  needs: AdvisoryNeedInput[];
  barangayId?: string | null;
  now?: Date;
}): AdvisoryRecommendationResponse {
  const needs = z.array(advisoryNeedInputSchema).max(5_000).parse(input.needs);
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const asOfDate = generatedAt.slice(0, 10);

  const recommendations = needs
    .filter((need) => need.activeFullProgramCount === 0)
    .map((need) => {
      const score = need.priorityScore ?? 3;
      const rule = INTERVENTIONS[need.category];
      const intervention = rule.alternatives[0];
      const hasPlan = need.plannedProposalCount > 0;
      const hasPartialActiveCoverage = need.activeProgramCount > 0;
      const budgetRange = range(need.historicalBenchmark?.budgetTotals ?? []);
      const volunteerRange = range(need.historicalBenchmark?.volunteerCounts ?? []);
      const matchedRecords = need.historicalBenchmark?.matchedRecords ?? 0;
      const benchmarkConfidence = matchedRecords === 0
        ? "unavailable" as const
        : budgetRange || volunteerRange ? "moderate" as const : "limited" as const;
      const priorProgramNote = need.completedProgramCount > 0
        ? ` ${need.completedProgramCount} completed related program${need.completedProgramCount === 1 ? " is" : "s are"} recorded, so verify whether the need persists before finalizing a response.`
        : "";
      const coverageEstimate = buildCoverageEstimate(need);
      const beneficiaryGuidance = buildBeneficiaryGuidance(need);

      const recommendation = {
        needId: need.id,
        barangay: { id: need.barangayId, name: need.barangayName },
        category: need.category,
        priority: { score, label: priorityLabel(score) },
        coverage: {
          state: hasPartialActiveCoverage ? "partial_active" as const : hasPlan ? "planned" as const : "unaddressed" as const,
          plannedProposals: need.plannedProposalCount,
          activePrograms: need.activeProgramCount,
          activeFullPrograms: need.activeFullProgramCount,
          activePartialPrograms: need.activeProgramCount - need.activeFullProgramCount,
          completedPrograms: need.completedProgramCount,
          estimate: coverageEstimate,
        },
        beneficiaryGuidance,
        action: hasPartialActiveCoverage ? "review_active_gap" as const : hasPlan ? "review_planned_response" as const : "develop_response" as const,
        intervention: {
          code: intervention.code,
          title: intervention.title,
          description: intervention.description,
        },
        alternatives: rule.alternatives.map((alternative) => ({
          code: alternative.code,
          title: alternative.title,
          description: alternative.description,
          suggestedSdgs: alternative.sdgs,
        })),
        indicativeResources: rule.resources,
        planningBenchmarks: {
          source: "verified_historical_programs" as const,
          matchedRecords,
          windowStart: need.historicalBenchmark?.windowStart ?? null,
          asOfDate: need.historicalBenchmark?.asOfDate ?? asOfDate,
          budgetRange: budgetRange ? { low: budgetRange.low.toFixed(2), high: budgetRange.high.toFixed(2), currency: "PHP" as const } : null,
          volunteerRange: volunteerRange ? { low: volunteerRange.low, high: volunteerRange.high } : null,
          confidence: benchmarkConfidence,
          limitation: matchedRecords === 0
            ? "No category-matched accepted and verified historical programs are available in the five-year window. No budget or staffing estimate was generated."
            : budgetRange || volunteerRange
              ? "Ranges describe observed verified records only. Finance, volunteer eligibility, availability, scope, and current prices still require human validation."
              : "Fewer than two usable budget or volunteer observations are available. No range was generated.",
        },
        suggestedSdgs: intervention.sdgs,
        rationale: hasPartialActiveCoverage
          ? `This approved ${need.category} need has an active linked program, but its recorded coverage is partial. Review the remaining affected group and current outcomes before deciding whether another response is appropriate.${priorProgramNote}`
          : hasPlan
          ? `This approved ${need.category} need has a planned proposal but no active linked program. Review the plan, its evidence, and implementation readiness.${priorProgramNote}`
          : `This approved ${need.category} need has no planned proposal or active linked program. Consider developing a human-reviewed response.${priorProgramNote}`,
        confidence: need.priorityScore === null ? "medium" as const : "high" as const,
        evidence: {
          source: "approved_community_need" as const,
          identifiedDate: need.identifiedDate,
          quality: "approved" as const,
          profiling: need.profilingEvidence,
        },
      };
      return {
        ...recommendation,
        recommendationFingerprint: recommendationFingerprint(recommendation),
        review: {
          status: "open" as const,
          lastAction: null,
          reasonCode: null,
          reviewedAt: null,
          reviewedBy: null,
        },
      };
    })
    .sort((a, b) =>
      b.priority.score - a.priority.score
      || Number(a.coverage.plannedProposals > 0) - Number(b.coverage.plannedProposals > 0)
      || a.barangay.name.localeCompare(b.barangay.name)
      || a.needId.localeCompare(b.needId)
    )
    .slice(0, 100);

  return advisoryRecommendationResponseSchema.parse({
    schema: "agape.ai.need-recommendations.v2",
    generatedAt,
    advisoryOnly: true,
    scope: {
      barangayId: input.barangayId ?? null,
      source: "approved_community_needs",
      asOfDate,
      canReview: false,
    },
    summary: {
      approvedOpenNeeds: needs.length,
      unaddressedNeeds: needs.filter((need) => need.activeProgramCount === 0 && need.plannedProposalCount === 0).length,
      needsWithPlannedResponses: needs.filter((need) => need.activeProgramCount === 0 && need.plannedProposalCount > 0).length,
      needsWithActivePrograms: needs.filter((need) => need.activeProgramCount > 0).length,
      needsWithPartialActiveCoverage: needs.filter((need) => need.activeProgramCount > 0 && need.activeFullProgramCount === 0).length,
      needsWithFullActiveCoverage: needs.filter((need) => need.activeFullProgramCount > 0).length,
      recommendationCount: recommendations.length,
    },
    recommendations,
  });
}
