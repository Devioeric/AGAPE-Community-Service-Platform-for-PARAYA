import { z } from "zod";

export const proposalAlignmentInputSchema = z.object({
  title: z.string().max(200).default(""),
  rationale: z.string().max(5_000).default(""),
  objectives: z.string().max(5_000).default(""),
  targetBeneficiaries: z.string().max(1_000).default(""),
  expectedOutput: z.string().max(5_000).default(""),
  timelineStart: z.string().default(""),
  timelineEnd: z.string().default(""),
  budget: z.number().nonnegative().nullable(),
  barangayId: z.string().uuid().nullable(),
  isIncomeGenerating: z.boolean(),
  sdgs: z.array(z.number().int().min(1).max(17)).max(17),
}).strict();

const checkSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{2,79}$/),
  label: z.string().min(1).max(120),
  status: z.enum(["ready", "review"]),
  message: z.string().min(1).max(300),
}).strict();

export const proposalAlignmentResultSchema = z.object({
  schema: z.literal("agape.ai.proposal-alignment.v1"),
  advisoryOnly: z.literal(true),
  score: z.number().int().min(0).max(100),
  level: z.enum(["ready_for_human_review", "review_recommended", "needs_more_detail"]),
  checks: z.array(checkSchema).length(10),
  suggestions: z.array(z.string().min(1).max(300)).max(10),
}).strict();

export type ProposalAlignmentInput = z.input<typeof proposalAlignmentInputSchema>;
export type ProposalAlignmentResult = z.infer<typeof proposalAlignmentResultSchema>;

function hasValidDateRange(start: string, end: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  return end >= start;
}

export function assessProposalAlignment(raw: ProposalAlignmentInput): ProposalAlignmentResult {
  const input = proposalAlignmentInputSchema.parse(raw);
  const checks = [
    {
      code: "clear_title",
      label: "Clear project title",
      ready: input.title.trim().length >= 3,
      pass: "The title is specific enough for an initial review.",
      review: "Use a specific title that names the intended intervention or result.",
    },
    {
      code: "evidence_rationale",
      label: "Evidence-based rationale",
      ready: input.rationale.trim().length >= 30,
      pass: "The rationale provides enough detail for an initial evidence review.",
      review: "Explain the approved need, local context, and why the response is appropriate.",
    },
    {
      code: "measurable_objectives",
      label: "Measurable objectives",
      ready: input.objectives.trim().length >= 15,
      pass: "Objectives are present for human validation.",
      review: "Add clear objectives that can be checked after implementation.",
    },
    {
      code: "beneficiary_scope",
      label: "Defined beneficiaries",
      ready: input.targetBeneficiaries.trim().length >= 5,
      pass: "A target beneficiary group is identified.",
      review: "State the beneficiary group and use an approved aggregate or documented manual estimate.",
    },
    {
      code: "expected_output",
      label: "Expected output",
      ready: input.expectedOutput.trim().length >= 10,
      pass: "An expected output is described.",
      review: "Describe a concrete output or result that the project should produce.",
    },
    {
      code: "target_barangay",
      label: "Target barangay",
      ready: input.barangayId !== null,
      pass: "A target barangay is selected.",
      review: "Select the target barangay and validate any sitio-specific scope during structured planning.",
    },
    {
      code: "implementation_period",
      label: "Implementation period",
      ready: hasValidDateRange(input.timelineStart, input.timelineEnd),
      pass: "The implementation dates form a valid period.",
      review: "Provide a start and end date, with the end date on or after the start date.",
    },
    {
      code: "resource_plan",
      label: "Initial resource plan",
      ready: input.budget !== null,
      pass: "An initial cash amount is recorded; Finance must still review the structured budget.",
      review: "Enter zero for a zero-cash activity or add an initial estimate for later Finance review.",
    },
    {
      code: "sdg_alignment",
      label: "SDG alignment",
      ready: input.sdgs.length > 0,
      pass: "At least one SDG is selected for evidence review.",
      review: "Select at least one applicable SDG and verify it against the planned activity.",
    },
    {
      code: "community_service_scope",
      label: "Community-service scope",
      ready: !input.isIncomeGenerating,
      pass: "The draft is marked as a non-income-generating community-service activity.",
      review: "The draft is marked income-generating. Confirm scope and policy with the Director instead of relying on automation.",
    },
  ].map((check) => ({
    code: check.code,
    label: check.label,
    status: check.ready ? "ready" as const : "review" as const,
    message: check.ready ? check.pass : check.review,
  }));

  const readyCount = checks.filter((check) => check.status === "ready").length;
  const score = readyCount * 10;
  return proposalAlignmentResultSchema.parse({
    schema: "agape.ai.proposal-alignment.v1",
    advisoryOnly: true,
    score,
    level: score >= 80
      ? "ready_for_human_review"
      : score >= 50
        ? "review_recommended"
        : "needs_more_detail",
    checks,
    suggestions: checks.filter((check) => check.status === "review").map((check) => check.message),
  });
}
