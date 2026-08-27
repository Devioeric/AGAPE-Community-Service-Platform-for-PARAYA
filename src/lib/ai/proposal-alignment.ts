import { z } from "zod";

export const proposalAlignmentInputSchema = z.object({
  title: z.string().max(200).default(""),
  rationale: z.string().max(5_000).default(""),
  objectives: z.string().max(5_000).default(""),
  targetBeneficiaries: z.string().max(1_000).default(""),
  expectedBeneficiaryCount: z.number().int().positive().nullable().default(null),
  expectedOutput: z.string().max(5_000).default(""),
  timelineStart: z.string().default(""),
  timelineEnd: z.string().default(""),
  budget: z.number().nonnegative().nullable(),
  barangayId: z.string().uuid().nullable(),
  isIncomeGenerating: z.boolean(),
  sdgs: z.array(z.number().int().min(1).max(17)).max(17),
  priorInitiativeCount: z.number().int().nonnegative().default(0),
}).strict();

const dimensionCodeSchema = z.enum([
  "community_need",
  "beneficiary_fit",
  "implementation_feasibility",
  "sdg_alignment",
  "resource_feasibility",
  "institutional_alignment",
  "previous_program_evidence",
  "policy_scope",
]);

const ratingSchema = z.enum(["strong", "moderate", "weak", "insufficient_evidence"]);

const dimensionSchema = z.object({
  code: dimensionCodeSchema,
  label: z.string().min(1).max(120),
  rating: ratingSchema,
  evidence: z.array(z.string().min(1).max(240)).min(1).max(4),
  finding: z.string().min(1).max(360),
  action: z.string().min(1).max(300).nullable(),
}).strict();

export const proposalAlignmentResultSchema = z.object({
  schema: z.literal("agape.ai.proposal-alignment.v2"),
  advisoryOnly: z.literal(true),
  overall: z.enum(["recommended", "review_required", "not_recommended"]),
  overallLabel: z.enum(["Recommended", "Review Required", "Not Recommended"]),
  summary: z.string().min(1).max(400),
  dimensions: z.array(dimensionSchema).length(8),
  priorityActions: z.array(z.string().min(1).max(300)).max(8),
  limitations: z.array(z.string().min(1).max(300)).min(1).max(6),
}).strict();

export type ProposalAlignmentInput = z.input<typeof proposalAlignmentInputSchema>;
export type ProposalAlignmentResult = z.infer<typeof proposalAlignmentResultSchema>;

type Dimension = z.infer<typeof dimensionSchema>;
type Rating = z.infer<typeof ratingSchema>;

function hasValidDateRange(start: string, end: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  return end >= start;
}

function dimension(
  code: Dimension["code"],
  label: string,
  rating: Rating,
  evidence: string[],
  finding: string,
  action: string | null,
): Dimension {
  return { code, label, rating, evidence, finding, action };
}

export function assessProposalAlignment(raw: ProposalAlignmentInput): ProposalAlignmentResult {
  const input = proposalAlignmentInputSchema.parse(raw);
  const hasRationale = input.rationale.trim().length >= 30;
  const hasBeneficiaryGroup = input.targetBeneficiaries.trim().length >= 5;
  const hasBeneficiaryCount = input.expectedBeneficiaryCount !== null;
  const implementationSignals = [
    input.title.trim().length >= 3,
    input.objectives.trim().length >= 15,
    input.expectedOutput.trim().length >= 10,
    hasValidDateRange(input.timelineStart, input.timelineEnd),
  ];
  const implementationCount = implementationSignals.filter(Boolean).length;

  const dimensions: Dimension[] = [
    hasRationale && input.barangayId
      ? dimension(
          "community_need",
          "Community need",
          "moderate",
          ["A target barangay and explanatory rationale are present."],
          "The draft describes a local need, but this quick check cannot verify an approved need or aggregate evidence link.",
          "Link an approved community need or approved aggregate evidence before submission.",
        )
      : dimension(
          "community_need",
          "Community need",
          hasRationale || input.barangayId ? "weak" : "insufficient_evidence",
          [hasRationale ? "A rationale is present." : "No sufficiently detailed rationale is present.", input.barangayId ? "A target barangay is selected." : "No target barangay is selected."],
          "The available draft does not yet establish both the location and rationale for the proposed response.",
          "Select the target barangay, explain the approved need and local context, then attach approved evidence.",
        ),
    hasBeneficiaryGroup && hasBeneficiaryCount
      ? dimension(
          "beneficiary_fit",
          "Beneficiary appropriateness",
          "strong",
          ["A beneficiary group and positive whole-number estimate are present."],
          "The intended beneficiary group and planning count are clear enough for human evidence review.",
          null,
        )
      : dimension(
          "beneficiary_fit",
          "Beneficiary appropriateness",
          hasBeneficiaryGroup || hasBeneficiaryCount ? "moderate" : "insufficient_evidence",
          [hasBeneficiaryGroup ? "A beneficiary group is named." : "No beneficiary group is named.", hasBeneficiaryCount ? "A planning count is present." : "No positive planning count is present."],
          "The beneficiary definition or its planning count is incomplete.",
          "Provide both a controlled beneficiary group and an evidence-backed or documented manual count.",
        ),
    implementationCount === 4
      ? dimension(
          "implementation_feasibility",
          "Implementation feasibility",
          "strong",
          ["The draft has a clear title, objectives, expected output, and valid implementation period."],
          "The core delivery plan is sufficiently described for detailed human review.",
          null,
        )
      : dimension(
          "implementation_feasibility",
          "Implementation feasibility",
          implementationCount >= 2 ? "moderate" : implementationCount === 1 ? "weak" : "insufficient_evidence",
          [`${implementationCount} of 4 basic implementation signals are present.`],
          "The draft needs clearer delivery information before feasibility can be judged reliably.",
          "Complete the title, measurable objectives, expected output, and valid start/end dates.",
        ),
    input.sdgs.length > 0
      ? dimension(
          "sdg_alignment",
          "SDG alignment",
          "moderate",
          [`${input.sdgs.length} SDG${input.sdgs.length === 1 ? " is" : "s are"} selected.`],
          "The selected SDGs provide an initial alignment claim, but an authorized reviewer must confirm their relevance.",
          "Add a short indicator or justification for each selected SDG during evidence review.",
        )
      : dimension(
          "sdg_alignment",
          "SDG alignment",
          "insufficient_evidence",
          ["No SDG is selected."],
          "No SDG alignment can be assessed from the current draft.",
          "Select at least one applicable SDG and document why it applies.",
        ),
    input.budget !== null
      ? dimension(
          "resource_feasibility",
          "Budget and resource feasibility",
          "moderate",
          [input.budget === 0 ? "The draft declares zero initial cash." : "An initial cash estimate is present.", "Volunteer capacity and structured funding sources are not part of this quick check."],
          "Cash planning has started, but Finance and operational staff still need to validate the complete resource plan.",
          input.budget === 0
            ? "Document the in-kind or other resources that make the zero-cash plan feasible."
            : "Complete the structured budget, funding sources, in-kind resources, and volunteer-capacity plan.",
        )
      : dimension(
          "resource_feasibility",
          "Budget and resource feasibility",
          "insufficient_evidence",
          ["No initial cash amount or zero-cash declaration is present."],
          "The available draft cannot support a resource-feasibility assessment.",
          "Enter an initial estimate or zero-cash declaration, then complete Finance and capacity review.",
        ),
    dimension(
      "institutional_alignment",
      "PARAYA mission and DYCI objectives",
      "insufficient_evidence",
      ["The draft is not yet linked to an approved institutional objective catalog."],
      "This quick check cannot infer institutional alignment from proposal wording alone.",
      "Have an authorized reviewer confirm the applicable PARAYA mission and DYCI objective.",
    ),
    input.priorInitiativeCount > 0
      ? dimension(
          "previous_program_evidence",
          "Previous-program evidence",
          "moderate",
          [`${input.priorInitiativeCount} prior initiative${input.priorInitiativeCount === 1 ? " is" : "s are"} cited.`],
          "Prior initiative lineage is present, but outcomes and source quality still require human validation.",
          "Confirm the prior outcome, quality, and lessons that materially inform this approach.",
        )
      : dimension(
          "previous_program_evidence",
          "Previous-program evidence",
          "insufficient_evidence",
          ["No prior initiative is cited in this draft."],
          "No conclusion about previous program performance can be drawn from the current draft.",
          "Cite a relevant verified program when available, or record that no suitable history exists.",
        ),
    input.isIncomeGenerating
      ? dimension(
          "policy_scope",
          "Policy and community-service scope",
          "weak",
          ["The draft is marked as income-generating."],
          "The activity needs an explicit Director policy review; this advisory check cannot determine eligibility.",
          "Confirm scope and policy with the Director instead of relying on automation.",
        )
      : dimension(
          "policy_scope",
          "Policy and community-service scope",
          "strong",
          ["The draft is marked as a non-income-generating community-service activity."],
          "No income-generation scope warning is present, subject to normal human policy review.",
          null,
        ),
  ];

  const coreCodes = new Set<Dimension["code"]>([
    "community_need",
    "beneficiary_fit",
    "implementation_feasibility",
    "sdg_alignment",
    "resource_feasibility",
  ]);
  const core = dimensions.filter((item) => coreCodes.has(item.code));
  const coreUnready = core.filter((item) => item.rating === "weak" || item.rating === "insufficient_evidence").length;
  const hasPolicyWarning = dimensions.some((item) => item.code === "policy_scope" && item.rating === "weak");
  const overall = coreUnready === 0 && !hasPolicyWarning
    ? "recommended"
    : coreUnready >= 4
      ? "not_recommended"
      : "review_required";
  const overallLabel = overall === "recommended"
    ? "Recommended"
    : overall === "not_recommended"
      ? "Not Recommended"
      : "Review Required";
  const summary = overall === "recommended"
    ? "The core planning dimensions are ready for human review. Remaining evidence limitations must still be resolved before submission."
    : overall === "not_recommended"
      ? "The draft lacks enough core planning evidence for a responsible recommendation. Improve the identified dimensions before human review."
      : "The draft has useful planning information, but one or more core dimensions require human review or additional evidence.";

  return proposalAlignmentResultSchema.parse({
    schema: "agape.ai.proposal-alignment.v2",
    advisoryOnly: true,
    overall,
    overallLabel,
    summary,
    dimensions,
    priorityActions: dimensions.flatMap((item) => item.action ? [item.action] : []).slice(0, 8),
    limitations: [
      "This deterministic check uses only the current draft and does not query resident-level records.",
      "Institutional alignment, volunteer capacity, Finance clearance, evidence quality, and final eligibility remain human decisions.",
      "A weak or not-recommended result never rejects or changes the proposal workflow automatically.",
    ],
  });
}
