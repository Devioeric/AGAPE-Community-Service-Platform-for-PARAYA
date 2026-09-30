import { z } from "zod";
import { proposalDraftGraphSchema, toProposalGraphRpcPayload, type ProposalDraftGraphInput } from "@/lib/phase2/contracts";

const id = z.string().uuid();
const date = z.string().date();
const ACTIVE_FOCUS_SDGS = [4, 9, 11, 17] as const;

/**
 * Small contributor-facing write contract.  The server expands this into the
 * existing Phase 2 proposal graph; callers never choose an Officer, workflow
 * status, creator, finance state, or decision actor.
 */
export const contributorProposalInputSchema = z.strictObject({
  partnerId: id,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(5000),
  categoryId: id,
  targetBarangayId: id,
  targetSitioId: id.nullable().optional(),
  needId: id,
  startsOn: date,
  endsOn: date,
  beneficiaryCount: z.number().int().positive(),
  budgetAmount: z.number().finite().positive().max(999999999999),
  budgetDescription: z.string().trim().min(1).max(500),
  beneficiaryCategoryCode: z.string().trim().min(1).max(80).optional(),
  // AGAPE's active reporting scope is limited to the four approved focus
  // goals.  The server still cross-checks the catalog; this client-facing
  // contract prevents a Contributor from submitting an out-of-scope goal.
  sdgNumbers: z.array(z.number().int().refine((value) => (ACTIVE_FOCUS_SDGS as readonly number[]).includes(value), "Only the four AGAPE focus SDGs are allowed")).min(1).max(4).optional(),
}).superRefine((value, ctx) => {
  if (value.endsOn < value.startsOn) {
    ctx.addIssue({ code: "custom", path: ["endsOn"], message: "End date cannot precede start date" });
  }
});

export type ContributorProposalInput = z.infer<typeof contributorProposalInputSchema>;

export type ContributorCatalog = {
  partners?: Array<{ id: string; code?: string; name: string; type?: string }>;
  responsibleOfficers?: Array<{ id: string; name: string; role?: string }>;
  projectCategories?: Array<{ id: string; code?: string; label: string }>;
  beneficiaryCategories?: Array<{ code: string; label: string; planningCubeAvailable?: boolean }>;
  budgetCategories?: Array<{ id: string; code?: string; label: string }>;
  barangays?: Array<{ id: string; name: string; sitios?: Array<{ id: string; name: string }> }>;
  approvedNeeds?: Array<{ id: string; barangayId: string; title: string; category?: string; priority?: number }>;
  sdgs?: Array<{ number: number; label: string }>;
};

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

function decimal(value: number) {
  return value.toFixed(2);
}

/** Build the canonical graph while keeping all authoritative actor fields server-owned. */
export function contributorInputToGraph(input: ContributorProposalInput, catalog: ContributorCatalog): ProposalDraftGraphInput {
  const beneficiary = input.beneficiaryCategoryCode
    ? catalog.beneficiaryCategories?.find((item) => item.code === input.beneficiaryCategoryCode)
    : catalog.beneficiaryCategories?.[0];
  const budgetCategory = catalog.budgetCategories?.[0];
  if (!beneficiary) throw new Error("No active beneficiary category is available");
  if (!budgetCategory) throw new Error("No active budget category is available");

  const targetAreaKey = `${input.targetBarangayId}:${input.targetSitioId ?? "all"}`;
  const graph = {
    title: input.title,
    description: input.summary,
    originChannel: "partner_document" as const,
    originatingPartnerId: input.partnerId,
    // This sentinel is replaced by the SQL RPC with a verified active Officer.
    responsibleOfficerId: ZERO_UUID,
    projectCategoryId: input.categoryId,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    targets: [{ barangayId: input.targetBarangayId, sitioId: input.targetSitioId ?? null, isLead: true }],
    needs: [{
      needId: input.needId,
      targetAreaKey,
      intendedCoverage: "full" as const,
      plannedBeneficiaryCount: input.beneficiaryCount,
      plannedBeneficiaryPercentage: null,
      notes: null,
    }],
    beneficiaryCategoryCodes: [beneficiary.code],
    finalBeneficiaryCount: input.beneficiaryCount,
    beneficiarySourceDescription: "Contributor-provided planning estimate; PARAYA Officer review required.",
    beneficiaryEstimates: [{
      categoryCode: beneficiary.code,
      targetAreaKey,
      evidenceSnapshotId: null,
      finalCount: input.beneficiaryCount,
      manualSourceDescription: "Contributor-provided planning estimate for Officer review.",
      overrideReason: null,
    }],
    sdgNumbers: input.sdgNumbers ?? [4],
    zeroCash: false,
    zeroCashJustification: null,
    budgetItems: [{
      categoryId: budgetCategory.id,
      kind: "cash" as const,
      description: input.budgetDescription,
      quantity: "1",
      unit: "project",
      unitCost: decimal(input.budgetAmount),
      inKindValuation: null,
      notes: null,
      sortOrder: 0,
    }],
    fundingSources: [{
      type: "internal_dyci" as const,
      state: "expected" as const,
      partnerId: null,
      cashValue: decimal(input.budgetAmount),
      inKindValue: "0.00",
      notes: null,
    }],
  };
  const parsed = proposalDraftGraphSchema.safeParse(graph);
  if (!parsed.success) throw new Error("Contributor proposal data is incomplete");
  return parsed.data;
}

export function contributorGraphRpcPayload(graph: ProposalDraftGraphInput) {
  return toProposalGraphRpcPayload(graph);
}

export type ContributorProposalSummary = {
  id: string;
  partnerId: string | null;
  title: string;
  summary: string;
  status: string;
  rowVersion: number;
  targetBarangayId: string | null;
  targetBarangayName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

