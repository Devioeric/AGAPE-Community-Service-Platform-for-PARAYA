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
  profilingEvidence: advisoryProfilingEvidenceSchema.nullable(),
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

export const advisoryRecommendationSchema = z.object({
  needId: z.string().uuid(),
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
  }).strict(),
  action: z.enum(["develop_response", "review_planned_response", "review_active_gap"]),
  intervention: z.object({
    code: z.string().regex(/^[a-z][a-z0-9_]{2,79}$/),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
  }).strict(),
  alternatives: z.array(interventionSchema).min(2).max(3),
  indicativeResources: z.array(resourceSchema).min(1).max(8),
  suggestedSdgs: z.array(z.number().int().min(1).max(17)).min(1).max(5),
  rationale: z.string().trim().min(1).max(500),
  confidence: z.enum(["high", "medium"]),
  evidence: z.object({
    source: z.literal("approved_community_need"),
    identifiedDate: z.string().date(),
    quality: z.literal("approved"),
    profiling: advisoryProfilingEvidenceSchema.nullable(),
  }).strict(),
}).strict();

export const advisoryRecommendationResponseSchema = z.object({
  schema: z.literal("agape.ai.need-recommendations.v2"),
  generatedAt: z.string().datetime(),
  advisoryOnly: z.literal(true),
  scope: z.object({
    barangayId: z.string().uuid().nullable(),
    source: z.literal("approved_community_needs"),
    asOfDate: z.string().date(),
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
      const priorProgramNote = need.completedProgramCount > 0
        ? ` ${need.completedProgramCount} completed related program${need.completedProgramCount === 1 ? " is" : "s are"} recorded, so verify whether the need persists before finalizing a response.`
        : "";

      return {
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
        },
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
