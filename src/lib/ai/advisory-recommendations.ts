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

const INTERVENTIONS: Record<z.infer<typeof needCategorySchema>, InterventionRule> = {
  health: {
    code: "community_health_outreach",
    title: "Community health assessment and outreach",
    description: "Validate the priority with local health partners, then prepare a focused prevention, referral, and education activity.",
    sdgs: [3],
  },
  livelihood: {
    code: "livelihood_skills_market_linkage",
    title: "Livelihood skills and market-linkage initiative",
    description: "Assess participant readiness and connect practical skills development with mentoring, resources, and realistic market opportunities.",
    sdgs: [1, 8],
  },
  education: {
    code: "learning_support_intervention",
    title: "Targeted learning support intervention",
    description: "Coordinate with education stakeholders to define the learner group, support activity, materials, and measurable learning outputs.",
    sdgs: [4],
  },
  infrastructure: {
    code: "infrastructure_readiness_assessment",
    title: "Infrastructure readiness and partner assessment",
    description: "Document the service gap, validate technical feasibility, and identify the government or community partners needed before project design.",
    sdgs: [9, 11],
  },
  environment: {
    code: "environmental_resilience_action",
    title: "Environmental resilience action",
    description: "Combine community education, local coordination, and a measurable environmental action suited to the approved need category.",
    sdgs: [6, 11, 13],
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
      const intervention = INTERVENTIONS[need.category];
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
