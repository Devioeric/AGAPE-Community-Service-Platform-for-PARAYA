import { createHash } from "node:crypto";
import { z } from "zod";

export const needCategorySchema = z.enum([
  "health",
  "livelihood",
  "education",
  "infrastructure",
  "environment",
]);

const partnerEntityTypeSchema = z.enum([
  "barangay",
  "dyci_office",
  "student_organization",
  "academic_department",
  "external_organization",
  "government_agency",
  "school",
  "faith_based",
  "other",
]);

const partnershipAdvisoryAvailabilitySchema = z.enum([
  "available",
  "component_disabled",
  "runtime_off",
  "unavailable",
]);

export const advisoryPartnerCandidateInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(3).max(40),
  name: z.string().trim().min(1).max(160),
  entityType: partnerEntityTypeSchema,
  isHostBarangay: z.boolean(),
  relationshipStatus: z.enum(["proposed", "active", "suspended", "ended", "none"]),
  expiresOn: z.string().date().nullable(),
  agreementReadiness: z.enum(["documented", "director_exception", "not_required", "incomplete"]),
  needCoverage: z.enum(["unaddressed", "partial", "addressed"]).nullable(),
  relatedProgramCount: z.number().int().nonnegative(),
  recordedOutcomeCount: z.number().int().nonnegative(),
  categoryMatchedVerifiedHistoryCount: z.number().int().nonnegative(),
}).strict();

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

const advisoryLocalCapacityInputSchema = z.object({
  skillCategories: z.array(z.object({
    category: z.enum(["trade", "education", "health", "agriculture", "technology", "other"]),
    practitionerCount: z.number().int().nonnegative(),
  }).strict()).max(6),
  assetCategories: z.array(z.object({
    type: z.enum(["facility", "equipment", "natural", "infrastructure", "other"]),
    usableQuantity: z.number().int().nonnegative(),
  }).strict()).max(5),
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
  recentCompletedProgramCount: z.number().int().nonnegative(),
  largestLinkedPlannedBeneficiaryCount: z.number().int().positive().nullable(),
  profilingEvidence: advisoryProfilingEvidenceSchema.nullable(),
  historicalBenchmark: advisoryHistoricalBenchmarkInputSchema.nullable(),
  localCapacity: advisoryLocalCapacityInputSchema.nullable(),
  partnershipAvailability: partnershipAdvisoryAvailabilitySchema,
  partnerCandidates: z.array(advisoryPartnerCandidateInputSchema).max(500),
}).strict().superRefine((value, ctx) => {
  if (value.activeFullProgramCount > value.activeProgramCount) {
    ctx.addIssue({ code: "custom", message: "Full active coverage cannot exceed all active coverage" });
  }
  if (value.recentCompletedProgramCount > value.completedProgramCount) {
    ctx.addIssue({ code: "custom", message: "Recent completed programs cannot exceed all completed programs" });
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

const volunteerGuidanceSchema = z.object({
  planningTarget: z.number().int().positive().nullable(),
  estimatedRange: z.object({
    low: z.number().int().positive(),
    high: z.number().int().positive(),
  }).strict().nullable(),
  source: z.enum(["verified_history_and_aggregate", "approved_aggregate_rule", "verified_history_only", "unavailable"]),
  confidence: z.enum(["moderate", "limited", "unavailable"]),
  factors: z.array(z.enum(["beneficiary_scale", "activity_category", "verified_history", "eligibility_pending", "availability_pending"])).min(2).max(5),
  limitation: z.string().trim().min(1).max(500),
}).strict();

const localCapacityGuidanceSchema = z.object({
  source: z.literal("barangay_skill_asset_aggregate"),
  asOfDate: z.string().date(),
  relevantSkills: z.array(z.object({
    category: z.enum(["trade", "education", "health", "agriculture", "technology", "other"]),
    practitionerCount: z.number().int().nonnegative(),
  }).strict()).max(4),
  relevantAssets: z.array(z.object({
    type: z.enum(["facility", "equipment", "natural", "infrastructure", "other"]),
    usableQuantity: z.number().int().nonnegative(),
  }).strict()).max(4),
  readiness: z.enum(["documented_capacity", "partial_capacity", "no_matching_capacity", "unavailable"]),
  limitation: z.string().trim().min(1).max(500),
}).strict();

const partnershipCandidateSchema = z.object({
  rank: z.number().int().min(1).max(3),
  partner: z.object({
    id: z.string().uuid(),
    code: z.string().trim().min(3).max(40),
    name: z.string().trim().min(1).max(160),
    entityType: partnerEntityTypeSchema,
  }).strict(),
  fitScore: z.number().int().min(0).max(100),
  signals: z.array(z.enum([
    "direct_remaining_need_link",
    "active_relationship",
    "verified_category_history",
    "related_program_experience",
    "recorded_program_outcomes",
    "host_community",
    "documentation_ready",
    "renewal_attention",
  ])).min(1).max(8),
  relationship: z.object({
    status: z.enum(["proposed", "active", "suspended", "ended", "none"]),
    renewalStatus: z.enum(["current", "due_within_60_days", "due_within_30_days", "due_within_7_days", "expired", "not_applicable"]),
    expiresOn: z.string().date().nullable(),
    agreementReadiness: z.enum(["documented", "director_exception", "not_required", "incomplete"]),
  }).strict(),
  experience: z.object({
    relatedPrograms: z.number().int().nonnegative(),
    recordedOutcomes: z.number().int().nonnegative(),
    categoryMatchedVerifiedHistory: z.number().int().nonnegative(),
  }).strict(),
  rationale: z.string().trim().min(1).max(500),
}).strict();

const partnershipGuidanceSchema = z.object({
  availability: partnershipAdvisoryAvailabilitySchema,
  state: z.enum(["available_candidates", "no_matching_candidates", "component_disabled", "runtime_off", "unavailable"]),
  advisoryOnly: z.literal(true),
  candidates: z.array(partnershipCandidateSchema).max(3),
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
    recentCompletedPrograms: z.number().int().nonnegative(),
    olderOrUndatedCompletedPrograms: z.number().int().nonnegative(),
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
  volunteerGuidance: volunteerGuidanceSchema,
  localCapacityGuidance: localCapacityGuidanceSchema,
  automation: z.object({
    eligible: z.boolean(),
    reason: z.enum([
      "lower_priority_manual_analysis",
      "high_priority_partial_active_gap",
      "planned_coverage_at_or_above_threshold",
      "high_priority_insufficient_planned_coverage",
      "high_priority_planned_coverage_unverified",
      "high_priority_unaddressed",
    ]),
    sufficientCoveragePercent: z.number().min(1).max(100),
  }).strict(),
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
  partnershipGuidance: partnershipGuidanceSchema,
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
    sufficientCoveragePercent: z.number().min(1).max(100),
    recommendationSettingsRowVersion: z.number().int().positive().nullable(),
    recommendationSettingsSource: z.enum(["database", "safe_default"]),
    canReview: z.boolean(),
    canConfigureThreshold: z.boolean(),
  }).strict(),
  summary: z.object({
    approvedOpenNeeds: z.number().int().nonnegative(),
    unaddressedNeeds: z.number().int().nonnegative(),
    needsWithPlannedResponses: z.number().int().nonnegative(),
    needsWithActivePrograms: z.number().int().nonnegative(),
    needsWithPartialActiveCoverage: z.number().int().nonnegative(),
    needsWithFullActiveCoverage: z.number().int().nonnegative(),
    needsWithRecentCompletedPrograms: z.number().int().nonnegative(),
    automatedAlertCandidates: z.number().int().nonnegative(),
    recommendationCount: z.number().int().nonnegative(),
  }).strict(),
  recommendations: z.array(advisoryRecommendationSchema).max(100),
}).strict();

export type AdvisoryNeedInput = z.infer<typeof advisoryNeedInputSchema>;
export type AdvisoryPartnerCandidateInput = z.infer<typeof advisoryPartnerCandidateInputSchema>;
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
  automation: {
    eligible: boolean;
    reason: string;
    sufficientCoveragePercent: number;
  };
  beneficiaryGuidance: {
    categoryCode: string;
    suggestedCount: number | null;
    source: string;
    asOfDate: string;
  };
  volunteerGuidance: {
    planningTarget: number | null;
    estimatedRange: { low: number; high: number } | null;
    source: string;
  };
  localCapacityGuidance: {
    asOfDate: string;
    relevantSkills: Array<{ category: string; practitionerCount: number }>;
    relevantAssets: Array<{ type: string; usableQuantity: number }>;
    readiness: string;
  };
  intervention: { code: string };
  alternatives: Array<{ code: string }>;
  indicativeResources: Array<{ category: string; item: string; indicativeQuantity: string }>;
  planningBenchmarks: {
    matchedRecords: number;
    budgetRange: unknown;
    volunteerRange: unknown;
  };
  partnershipGuidance: {
    availability: string;
    state: string;
    candidates: Array<{
      partner: { id: string };
      fitScore: number;
      signals: string[];
      relationship: { status: string; renewalStatus: string; expiresOn: string | null; agreementReadiness: string };
      experience: { relatedPrograms: number; recordedOutcomes: number; categoryMatchedVerifiedHistory: number };
    }>;
  };
  suggestedSdgs: number[];
  evidence: {
    identifiedDate: string;
    profiling: { evidenceSnapshotId: string; needCount: unknown } | null;
  };
}): string {
  const materialState = {
    schema: "agape.ai.need-recommendations.v2",
    ruleVersion: 4,
    needId: value.needId,
    category: value.category,
    priority: value.priority,
    coverage: value.coverage,
    automation: value.automation,
    beneficiaryGuidance: value.beneficiaryGuidance,
    volunteerGuidance: value.volunteerGuidance,
    localCapacityGuidance: {
      readiness: value.localCapacityGuidance.readiness,
      relevantSkills: value.localCapacityGuidance.relevantSkills,
      relevantAssets: value.localCapacityGuidance.relevantAssets,
    },
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
    partnershipGuidance: {
      availability: value.partnershipGuidance.availability,
      state: value.partnershipGuidance.state,
      candidates: value.partnershipGuidance.candidates.map((candidate) => ({
        partnerId: candidate.partner.id,
        fitScore: candidate.fitScore,
        signals: candidate.signals,
        relationship: candidate.relationship,
        experience: candidate.experience,
      })),
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

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

function renewalStatus(
  status: AdvisoryPartnerCandidateInput["relationshipStatus"],
  expiresOn: string | null,
  asOfDate: string,
) {
  if (status !== "active" || !expiresOn) return status === "active" ? "current" as const : "not_applicable" as const;
  const remainingDays = daysBetween(asOfDate, expiresOn);
  if (remainingDays < 0) return "expired" as const;
  if (remainingDays <= 7) return "due_within_7_days" as const;
  if (remainingDays <= 30) return "due_within_30_days" as const;
  if (remainingDays <= 60) return "due_within_60_days" as const;
  return "current" as const;
}

function buildPartnershipGuidance(need: AdvisoryNeedInput, asOfDate: string) {
  const unavailableState = need.partnershipAvailability === "component_disabled"
    ? "component_disabled" as const
    : need.partnershipAvailability === "runtime_off"
      ? "runtime_off" as const
      : "unavailable" as const;
  if (need.partnershipAvailability !== "available") {
    return {
      availability: need.partnershipAvailability,
      state: unavailableState,
      advisoryOnly: true as const,
      candidates: [],
      limitation: need.partnershipAvailability === "component_disabled"
        ? "Partner matching is unavailable while the Partner Registry component is disabled. Intervention guidance remains usable without Partner data."
        : need.partnershipAvailability === "runtime_off"
          ? "Partner matching is unavailable while the Partner Registry database runtime is off. No relationship data was queried."
          : "Partner matching could not be produced from the approved aggregate Partner contract. Select and validate a Partner manually.",
    };
  }

  const ranked = need.partnerCandidates
    .map((candidate) => {
      const renewal = renewalStatus(candidate.relationshipStatus, candidate.expiresOn, asOfDate);
      const signals: Array<z.infer<typeof partnershipCandidateSchema>["signals"][number]> = [];
      let fitScore = 0;
      if (candidate.needCoverage === "unaddressed" || candidate.needCoverage === "partial") {
        signals.push("direct_remaining_need_link");
        fitScore += candidate.needCoverage === "partial" ? 35 : 30;
      }
      if (candidate.relationshipStatus === "active" && renewal !== "expired") {
        signals.push("active_relationship");
        fitScore += 20;
      }
      if (candidate.categoryMatchedVerifiedHistoryCount > 0) {
        signals.push("verified_category_history");
        fitScore += Math.min(20, candidate.categoryMatchedVerifiedHistoryCount * 5);
      }
      if (candidate.relatedProgramCount > 0) {
        signals.push("related_program_experience");
        fitScore += Math.min(15, candidate.relatedProgramCount * 5);
      }
      if (candidate.recordedOutcomeCount > 0) {
        signals.push("recorded_program_outcomes");
        fitScore += Math.min(10, candidate.recordedOutcomeCount * 2);
      }
      if (candidate.isHostBarangay) {
        signals.push("host_community");
        fitScore += 10;
      }
      if (["documented", "director_exception", "not_required"].includes(candidate.agreementReadiness)) {
        signals.push("documentation_ready");
        fitScore += 5;
      }
      if (["due_within_60_days", "due_within_30_days", "due_within_7_days", "expired"].includes(renewal)) {
        signals.push("renewal_attention");
      }
      if (candidate.relationshipStatus === "suspended") fitScore -= 25;
      if (candidate.relationshipStatus === "ended" || candidate.relationshipStatus === "none") fitScore -= 15;
      if (renewal === "expired") fitScore -= 20;
      if (candidate.agreementReadiness === "incomplete") fitScore -= 10;

      const rationaleParts = [
        candidate.needCoverage === "partial"
          ? "The active relationship is linked to this need with partial coverage."
          : candidate.needCoverage === "unaddressed"
            ? "The relationship already records this need as unaddressed."
            : null,
        candidate.categoryMatchedVerifiedHistoryCount > 0
          ? `${candidate.categoryMatchedVerifiedHistoryCount} accepted, verified historical program${candidate.categoryMatchedVerifiedHistoryCount === 1 ? " matches" : "s match"} this need category.`
          : null,
        candidate.relatedProgramCount > 0
          ? `${candidate.relatedProgramCount} linked operational program${candidate.relatedProgramCount === 1 ? " provides" : "s provide"} relevant implementation context.`
          : null,
        candidate.recordedOutcomeCount > 0
          ? `${candidate.recordedOutcomeCount} active quantitative outcome record${candidate.recordedOutcomeCount === 1 ? " is" : "s are"} available for human review.`
          : null,
        candidate.isHostBarangay ? "The Partner represents the host barangay for this need." : null,
        renewal === "expired" ? "The recorded term is expired and must be reviewed before engagement."
          : renewal.startsWith("due_within_") ? "The active term is approaching expiry, so renewal readiness should be reviewed."
            : null,
      ].filter((value): value is string => Boolean(value));

      return {
        candidate,
        fitScore: Math.max(0, Math.min(100, fitScore)),
        signals,
        renewal,
        rationale: rationaleParts.join(" ") || "This Partner is retained as a bounded candidate from approved relationship metadata; PARAYA must validate fit and capacity.",
      };
    })
    .filter((item) => item.signals.some((signal) => [
      "direct_remaining_need_link",
      "verified_category_history",
      "related_program_experience",
      "host_community",
    ].includes(signal)))
    .sort((left, right) => right.fitScore - left.fitScore || left.candidate.name.localeCompare(right.candidate.name) || left.candidate.id.localeCompare(right.candidate.id))
    .slice(0, 3)
    .map((item, index) => ({
      rank: index + 1,
      partner: {
        id: item.candidate.id,
        code: item.candidate.code,
        name: item.candidate.name,
        entityType: item.candidate.entityType,
      },
      fitScore: item.fitScore,
      signals: item.signals,
      relationship: {
        status: item.candidate.relationshipStatus,
        renewalStatus: item.renewal,
        expiresOn: item.candidate.expiresOn,
        agreementReadiness: item.candidate.agreementReadiness,
      },
      experience: {
        relatedPrograms: item.candidate.relatedProgramCount,
        recordedOutcomes: item.candidate.recordedOutcomeCount,
        categoryMatchedVerifiedHistory: item.candidate.categoryMatchedVerifiedHistoryCount,
      },
      rationale: item.rationale,
    }));

  return {
    availability: "available" as const,
    state: ranked.length > 0 ? "available_candidates" as const : "no_matching_candidates" as const,
    advisoryOnly: true as const,
    candidates: ranked,
    limitation: ranked.length > 0
      ? "Candidates are ranked from approved relationship, remaining-need, operational-program, and verified-history metadata only. PARAYA must confirm actual capacity, authority, availability, and agreement readiness."
      : "No Partner has enough approved relationship, remaining-need, host-community, or verified program evidence for a bounded suggestion. Select and validate a Partner manually.",
  };
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

const BENEFICIARIES_PER_VOLUNTEER: Record<z.infer<typeof needCategorySchema>, number> = {
  health: 15,
  livelihood: 12,
  education: 12,
  infrastructure: 10,
  environment: 20,
};

const RELEVANT_SKILL_CATEGORIES: Record<z.infer<typeof needCategorySchema>, ReadonlySet<string>> = {
  health: new Set(["health", "education"]),
  livelihood: new Set(["trade", "agriculture", "technology"]),
  education: new Set(["education", "technology"]),
  infrastructure: new Set(["trade", "technology"]),
  environment: new Set(["agriculture", "trade", "education"]),
};

const RELEVANT_ASSET_CATEGORIES: Record<z.infer<typeof needCategorySchema>, ReadonlySet<string>> = {
  health: new Set(["facility", "equipment"]),
  livelihood: new Set(["equipment", "facility", "natural"]),
  education: new Set(["facility", "equipment"]),
  infrastructure: new Set(["infrastructure", "equipment", "facility"]),
  environment: new Set(["natural", "equipment", "facility"]),
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

function buildVolunteerGuidance(
  need: AdvisoryNeedInput,
  beneficiaryGuidance: z.infer<typeof beneficiaryGuidanceSchema>,
  observedRange: { low: number; high: number } | null,
) {
  const aggregateTarget = beneficiaryGuidance.suggestedCount
    ? Math.max(3, Math.min(100, Math.ceil(beneficiaryGuidance.suggestedCount / BENEFICIARIES_PER_VOLUNTEER[need.category])))
    : null;
  const historyRange = observedRange && observedRange.high > 0
    ? { low: Math.max(1, observedRange.low), high: Math.max(1, observedRange.high) }
    : null;
  const factors: Array<z.infer<typeof volunteerGuidanceSchema>["factors"][number]> = [
    "activity_category",
    "eligibility_pending",
    "availability_pending",
  ];
  if (aggregateTarget !== null) factors.unshift("beneficiary_scale");
  if (historyRange) factors.unshift("verified_history");

  if (aggregateTarget !== null && historyRange) {
    const aggregateLow = Math.max(1, Math.floor(aggregateTarget * 0.75));
    const aggregateHigh = Math.max(aggregateLow, Math.ceil(aggregateTarget * 1.25));
    return {
      planningTarget: Math.max(1, Math.round((aggregateTarget + (historyRange.low + historyRange.high) / 2) / 2)),
      estimatedRange: {
        low: Math.min(aggregateLow, historyRange.low),
        high: Math.max(aggregateHigh, historyRange.high),
      },
      source: "verified_history_and_aggregate" as const,
      confidence: "moderate" as const,
      factors,
      limitation: "This is a non-binding planning estimate based on the approved sample count, activity category, and observed verified programs. Confirm program duration, roles, eligibility, skills, schedule availability, supervision, and final participant reach before assignment.",
    };
  }
  if (aggregateTarget !== null) {
    const low = Math.max(1, Math.floor(aggregateTarget * 0.75));
    return {
      planningTarget: aggregateTarget,
      estimatedRange: { low, high: Math.max(low, Math.ceil(aggregateTarget * 1.25)) },
      source: "approved_aggregate_rule" as const,
      confidence: "limited" as const,
      factors,
      limitation: "This is a non-binding category-and-scale estimate from the approved profiled sample. No verified historical staffing range was available; confirm duration, roles, eligibility, skills, schedule availability, supervision, and actual reach.",
    };
  }
  if (historyRange) {
    return {
      planningTarget: Math.max(1, Math.round((historyRange.low + historyRange.high) / 2)),
      estimatedRange: historyRange,
      source: "verified_history_only" as const,
      confidence: "limited" as const,
      factors,
      limitation: "This non-binding estimate uses only category-matched verified historical staffing. A compatible unsuppressed beneficiary count is unavailable; confirm current scope, duration, roles, eligibility, skills, schedule availability, and supervision.",
    };
  }
  return {
    planningTarget: null,
    estimatedRange: null,
    source: "unavailable" as const,
    confidence: "unavailable" as const,
    factors,
    limitation: "No compatible approved aggregate count or verified historical staffing range is available. A human planner must document the activity duration, roles, eligibility, skills, schedule availability, supervision, and staffing source.",
  };
}

function buildLocalCapacityGuidance(need: AdvisoryNeedInput, asOfDate: string) {
  if (!need.localCapacity) {
    return {
      source: "barangay_skill_asset_aggregate" as const,
      asOfDate,
      relevantSkills: [],
      relevantAssets: [],
      readiness: "unavailable" as const,
      limitation: "No approved barangay-level skill or asset aggregate is available. Confirm resources manually and do not infer individual availability.",
    };
  }
  const relevantSkills = need.localCapacity.skillCategories
    .filter((item) => RELEVANT_SKILL_CATEGORIES[need.category].has(item.category) && item.practitionerCount > 0)
    .sort((left, right) => right.practitionerCount - left.practitionerCount || left.category.localeCompare(right.category))
    .slice(0, 4);
  const relevantAssets = need.localCapacity.assetCategories
    .filter((item) => RELEVANT_ASSET_CATEGORIES[need.category].has(item.type) && item.usableQuantity > 0)
    .sort((left, right) => right.usableQuantity - left.usableQuantity || left.type.localeCompare(right.type))
    .slice(0, 4);
  return {
    source: "barangay_skill_asset_aggregate" as const,
    asOfDate: need.localCapacity.asOfDate,
    relevantSkills,
    relevantAssets,
    readiness: relevantSkills.length > 0 && relevantAssets.length > 0
      ? "documented_capacity" as const
      : relevantSkills.length > 0 || relevantAssets.length > 0
        ? "partial_capacity" as const
        : "no_matching_capacity" as const,
    limitation: "Counts are barangay-level planning signals, not commitments. Confirm individual consent, eligibility, proficiency, availability, condition, ownership, scheduling, and permission before assigning people or resources.",
  };
}

export function buildAdvisoryRecommendations(input: {
  needs: AdvisoryNeedInput[];
  barangayId?: string | null;
  sufficientCoveragePercent?: number;
  recommendationSettingsRowVersion?: number | null;
  recommendationSettingsSource?: "database" | "safe_default";
  now?: Date;
}): AdvisoryRecommendationResponse {
  const needs = z.array(advisoryNeedInputSchema).max(5_000).parse(input.needs);
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const asOfDate = generatedAt.slice(0, 10);
  const sufficientCoveragePercent = z.number().min(1).max(100).parse(input.sufficientCoveragePercent ?? 80);

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
      const olderOrUndatedCompletedPrograms = need.completedProgramCount - need.recentCompletedProgramCount;
      const priorProgramNote = need.recentCompletedProgramCount > 0
        ? ` ${need.recentCompletedProgramCount} related program${need.recentCompletedProgramCount === 1 ? " was" : "s were"} completed within the previous 24 months; review its verified outcomes and whether the need recurred before finalizing a response.${olderOrUndatedCompletedPrograms > 0 ? ` ${olderOrUndatedCompletedPrograms} older or undated completed record${olderOrUndatedCompletedPrograms === 1 ? " is" : "s are"} retained as lower-recency context.` : ""}`
        : olderOrUndatedCompletedPrograms > 0
          ? ` ${olderOrUndatedCompletedPrograms} related completed record${olderOrUndatedCompletedPrograms === 1 ? " is" : "s are"} older than 24 months or undated, so treat that history as limited context and verify whether the need persists.`
          : "";
      const coverageEstimate = buildCoverageEstimate(need);
      const beneficiaryGuidance = buildBeneficiaryGuidance(need);
      const volunteerGuidance = buildVolunteerGuidance(need, beneficiaryGuidance, volunteerRange);
      const localCapacityGuidance = buildLocalCapacityGuidance(need, asOfDate);
      const partnershipGuidance = buildPartnershipGuidance(need, asOfDate);
      const isHighPriority = score >= 4;
      const plannedCoverageLooksSufficient = !hasPartialActiveCoverage
        && hasPlan
        && coverageEstimate.status === "available"
        && coverageEstimate.estimatedPercent >= sufficientCoveragePercent;
      const automation = {
        eligible: isHighPriority && !plannedCoverageLooksSufficient,
        reason: !isHighPriority
          ? "lower_priority_manual_analysis" as const
          : hasPartialActiveCoverage
            ? "high_priority_partial_active_gap" as const
            : plannedCoverageLooksSufficient
              ? "planned_coverage_at_or_above_threshold" as const
              : hasPlan && coverageEstimate.status === "available"
                ? "high_priority_insufficient_planned_coverage" as const
                : hasPlan
                  ? "high_priority_planned_coverage_unverified" as const
                  : "high_priority_unaddressed" as const,
        sufficientCoveragePercent,
      };

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
          recentCompletedPrograms: need.recentCompletedProgramCount,
          olderOrUndatedCompletedPrograms,
          estimate: coverageEstimate,
        },
        beneficiaryGuidance,
        volunteerGuidance,
        localCapacityGuidance,
        automation,
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
        partnershipGuidance,
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
      sufficientCoveragePercent,
      recommendationSettingsRowVersion: input.recommendationSettingsRowVersion ?? null,
      recommendationSettingsSource: input.recommendationSettingsSource ?? "safe_default",
      canReview: false,
      canConfigureThreshold: false,
    },
    summary: {
      approvedOpenNeeds: needs.length,
      unaddressedNeeds: needs.filter((need) => need.activeProgramCount === 0 && need.plannedProposalCount === 0).length,
      needsWithPlannedResponses: needs.filter((need) => need.activeProgramCount === 0 && need.plannedProposalCount > 0).length,
      needsWithActivePrograms: needs.filter((need) => need.activeProgramCount > 0).length,
      needsWithPartialActiveCoverage: needs.filter((need) => need.activeProgramCount > 0 && need.activeFullProgramCount === 0).length,
      needsWithFullActiveCoverage: needs.filter((need) => need.activeFullProgramCount > 0).length,
      needsWithRecentCompletedPrograms: needs.filter((need) => need.recentCompletedProgramCount > 0).length,
      automatedAlertCandidates: recommendations.filter((recommendation) => recommendation.automation.eligible).length,
      recommendationCount: recommendations.length,
    },
    recommendations,
  });
}
