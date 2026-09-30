import type { ProposalDraftGraphInput } from "@/lib/phase2/contracts";
import type { ProposalDTO } from "@/lib/phase2/types";

export type EditableProposalDetail = ProposalDTO & {
  needs: Array<{ id: string; needId: string; targetAreaId: string; coverage: "full" | "partial"; plannedCount: number | null; plannedPercentage: number | null; notes: string | null }>;
  sdgs: Array<{ number: number; indicator: string | null }>;
};

export function canEditProposal(status: string) { return status === "draft" || status === "revisions_requested"; }
export function canAdvancePreScreening(status: string) { return status === "submitted" || status === "pre_screening"; }

/** Copy the editable graph explicitly, preserving every child and its provenance. */
export function proposalDraftFromDetail(detail: EditableProposalDetail): ProposalDraftGraphInput {
  if (!canEditProposal(detail.status) || detail.budget?.status !== "draft") throw new Error("Only a draft or returned proposal with an editable budget may be corrected.");
  if (detail.sdgs.some((sdg) => sdg.indicator != null)) throw new Error("This proposal contains SDG indicator annotations that the current edit contract cannot preserve. Editing is unavailable until those annotations can be retained safely.");
  const targetKey = (id: string) => {
    const target = detail.targets.find((candidate) => candidate.id === id);
    if (!target) throw new Error("A proposal link has no matching target. Reload before editing.");
    return `${target.barangayId}:${target.sitioId ?? "all"}`;
  };
  return {
    title: detail.title, description: detail.description, originChannel: detail.originChannel,
    originatingPartnerId: detail.originatingPartnerId, responsibleOfficerId: detail.responsibleOfficerId,
    projectCategoryId: detail.projectCategoryId, startsOn: detail.startsOn, endsOn: detail.endsOn,
    targets: detail.targets.map(({ barangayId, sitioId, isLead }) => ({ barangayId, sitioId, isLead })),
    needs: detail.needs.map((need) => ({ needId: need.needId, targetAreaKey: targetKey(need.targetAreaId), intendedCoverage: need.coverage,
      plannedBeneficiaryCount: need.plannedCount, plannedBeneficiaryPercentage: need.plannedPercentage, notes: need.notes })),
    beneficiaryCategoryCodes: Array.from(new Set(detail.beneficiaryEstimates.map((estimate) => estimate.categoryCode))),
    finalBeneficiaryCount: detail.beneficiaryEstimates.reduce((sum, estimate) => sum + estimate.finalCount, 0),
    beneficiarySourceDescription: detail.beneficiaryEstimates.map((estimate) => estimate.sourceDescription).filter(Boolean).join("; ").slice(0, 500) || "Approved aggregate planning evidence.",
    beneficiaryEstimates: detail.beneficiaryEstimates.map((estimate) => ({ categoryCode: estimate.categoryCode,
      targetAreaKey: targetKey(estimate.targetAreaId), evidenceSnapshotId: estimate.evidenceSnapshotId,
      finalCount: estimate.finalCount, manualSourceDescription: estimate.evidenceSnapshotId ? null : estimate.sourceDescription,
      overrideReason: estimate.overrideReason })),
    sdgNumbers: detail.sdgs.map((sdg) => sdg.number), zeroCash: detail.budget.zeroCash,
    zeroCashJustification: detail.budget.zeroCashJustification,
    budgetItems: detail.budget.items.map(({ categoryId, kind, description, quantity, unit, unitCost, inKindValuation, notes, sortOrder }) => ({ categoryId, kind, description, quantity, unit, unitCost, inKindValuation, notes, sortOrder })),
    fundingSources: detail.budget.fundingSources.map(({ type, state, partnerId, cashValue, inKindValue, notes }) => ({ type, state, partnerId, cashValue, inKindValue, notes })),
    expectedVersion: detail.rowVersion,
  };
}
