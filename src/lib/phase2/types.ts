export type PartnerEntityType = "barangay" | "dyci_office" | "student_organization" | "academic_department" | "external_organization" | "government_agency" | "school" | "faith_based" | "other";
export type PartnerEntityRole = "partner" | "proponent";
export type PartnerLifecycleStatus = "active" | "inactive" | "merged";
export type PartnershipTermStatus = "proposed" | "active" | "suspended" | "ended";
export type DerivedPartnershipStatus = PartnershipTermStatus | "expiring_soon" | "expired";
export type HistoricalProgramStatus = "draft" | "pending_review" | "accepted" | "returned" | "archived";
export type HistoricalProgramQuality = "complete" | "partial_verified" | "partial_unverified" | "unverified";
export type ProposalStatus = "draft" | "submitted" | "pre_screening" | "evidence_review" | "finance_review" | "director_review" | "revisions_requested" | "approved" | "rejected";
export type ProposalWorkflowAction = "submit" | "pass_pre_screening" | "confirm_evidence" | "request_revision" | "finance_clear" | "finance_return" | "director_approve" | "director_reject";
export type Phase2RuntimeMode = "off" | "synthetic" | "live";

export interface Phase2ReadinessDTO { component: string; mode: Phase2RuntimeMode; implementationDate: string | null; missingAttestations: string[]; readyForLive: boolean; writeAuthority: "v1" | "v2" | null; }

export interface PartnerContactDTO { id: string; fullName: string; title: string | null; email: string | null; phone: string | null; preferredChannel: "email" | "phone" | "manual"; isPrimary: boolean; statusEmailOptIn: boolean; activeFrom: string; activeUntil: string | null; }
export interface PartnershipTermDTO { id: string; status: PartnershipTermStatus; derivedStatus: DerivedPartnershipStatus; startsOn: string; expiresOn: string | null; endsOn: string | null; responsibleOfficerId: string; rowVersion: number; agreementException: { reason: string; dueOn: string } | null; }
export interface PartnerDTO { id: string; code: string; name: string; legalName: string | null; type: PartnerEntityType; classification: "internal" | "external"; lifecycle: PartnerLifecycleStatus; roles: PartnerEntityRole[]; barangayId: string | null; rowVersion: number; primaryContact?: PartnerContactDTO | null; currentTerm?: PartnershipTermDTO | null; }
export interface PartnerDetailDTO extends PartnerDTO { contacts: PartnerContactDTO[]; terms: PartnershipTermDTO[]; metrics: { programCount: number; proposalCount: number; historicalVerifiedCount: number; remainingNeedCount: number }; timeline: Array<{ id: string; type: string; reason: string | null; occurredAt: string }>; }
export interface HistoricalProgramDTO { id: string; code: string; title: string; summary: string | null; category: string; status: HistoricalProgramStatus; quality: HistoricalProgramQuality; datePrecision: "exact" | "month" | "year" | "unknown"; startsOn: string | null; endsOn: string | null; sourceType: string; rowVersion: number; }
export interface HistoricalProgramDetailDTO extends HistoricalProgramDTO {
  beneficiaryCount: number | null; volunteerCount: number | null; volunteerHours: string | null; budgetTotal: string | null; currency: "PHP";
  resources: string | null; historicalNeedDescription: string | null; outcomes: string | null; followUp: string | null; sourceNotes: string | null;
  allowedQuality: HistoricalProgramQuality; partnerIds: string[]; barangayIds: string[]; needIds: string[];
  sdgs: Array<{ number: number; source: "documented" | "retrospective" }>;
  documents: Array<{ id: string; originalName: string; sha256: string; mimeType: string; sizeBytes: number; scanStatus: string; createdAt: string }>;
  versions: Array<{ id: string; versionNumber: number; canonicalHash: string; reason: string; createdAt: string }>;
}
export interface HistoricalQualityAggregateDTO {
  schema: "agape.historical-programs.aggregate.v2"; scope: "all" | "own_barangay"; barangayId: string | null;
  implementationDate: string; windowStart: string; asOfDate: string;
  operational: { recordCount: number; budgetTotal: string };
  verifiedHistorical: { recordCount: number; beneficiaryCount: number; volunteerCount: number; volunteerHours: string; budgetTotal: string };
  unverifiedHistorical: { recordCount: number; beneficiaryCount: number; volunteerCount: number; volunteerHours: string; budgetTotal: string };
}
export interface ProposalTargetAreaDTO { id: string; barangayId: string; sitioId: string | null; isLead: boolean; }
export interface BeneficiaryEstimateDTO { id: string; categoryCode: string; targetAreaId: string; kind: "planning_cube" | "manual"; evidenceSnapshotId: string | null; calculatedCount: number | null; suppressed: boolean; finalCount: number; sourceDescription: string | null; sourceMetadata: Record<string, unknown>; qualityMetadata: Record<string, unknown>; asOfDate: string; overrideReason: string | null; }
export interface ProposalVersionDTO { id: string; versionNumber: number; canonicalHash: string; createdAt: string; reason: string; }
export interface ProposalBudgetItemDTO { id: string; categoryId: string; kind: "cash" | "in_kind"; description: string; quantity: string; unit: string; unitCost: string; amount: string; inKindValuation: string | null; notes: string | null; sortOrder: number; }
export interface ProposalFundingSourceDTO { id: string; type: "internal_dyci" | "external" | "cash_donation" | "in_kind_donation" | "partner_contribution" | "other"; state: "expected" | "confirmed"; partnerId: string | null; cashValue: string; inKindValue: string; notes: string | null; }
export interface ProposalDTO { id: string; title: string; description: string; status: ProposalStatus; originChannel: "paraya_internal" | "partner_document" | "barangay_referral"; originatingPartnerId: string | null; responsibleOfficerId: string; projectCategoryId: string; startsOn: string; endsOn: string; rowVersion: number; returnStage: string | null; requiredWarnings: string[]; targets: ProposalTargetAreaDTO[]; beneficiaryEstimates: BeneficiaryEstimateDTO[]; activeVersion: ProposalVersionDTO | null; versions: ProposalVersionDTO[]; budget: ProposalBudgetRevisionDTO | null; }
export interface ProposalBudgetRevisionDTO { id: string; proposalId: string; revisionNumber: number; status: "draft" | "submitted" | "returned" | "cleared" | "superseded"; currency: "PHP"; cashTotal: string; inKindTotal: string; zeroCash: boolean; zeroCashJustification: string | null; canonicalHash: string | null; rowVersion: number; items: ProposalBudgetItemDTO[]; fundingSources: ProposalFundingSourceDTO[]; }
export interface FinanceProposalDTO { proposal: Pick<ProposalDTO, "id" | "title" | "status" | "startsOn" | "endsOn" | "responsibleOfficerId" | "rowVersion" | "requiredWarnings">; budget: ProposalBudgetRevisionDTO & { fundingCashTotal: string; fundingInKindTotal: string; reconciled: boolean }; reviewHistory: Array<{ id: string; revisionId: string; action: string; remarks: string | null; actorId: string; occurredAt: string }>; }
export interface ProgramHandoffDTO { id: string; proposalId: string; proposalVersionId: string; budgetRevisionId: string; programId: string; createdAt: string; }
export interface ProgramBudgetItemDTO { id: string; categoryId: string; kind: "cash" | "in_kind"; description: string; allocatedAmount: string; sortOrder: number; }
export interface ProgramBudgetRevisionDTO { id: string; programId: string; revisionNumber: number; status: "draft" | "submitted" | "returned" | "active" | "superseded"; sourceRevisionId?: string | null; cashTotal: string; inKindTotal: string; canonicalHash: string | null; rowVersion: number; items?: ProgramBudgetItemDTO[]; }
export interface ProgramExpenditureDTO { id: string; programId: string; budgetItemId: string; amount: string; spentOn: string; payeeLabel: string | null; description: string; status: "pending" | "verified" | "returned" | "voided" | "replaced"; receiptDocumentId: string | null; receiptExceptionReason: string | null; varianceExplanation: string | null; replacesId: string | null; rowVersion: number; }
export interface LiquidationDTO { id: string; programId: string; revisionNumber: number; status: "draft" | "submitted" | "returned" | "verified" | "voided"; totalSubmitted: string; summary: { period_start?: string; period_end?: string; narrative?: string; exception_notes?: string | null }; expenditureIds: string[]; rowVersion: number; }
export interface ProgramFinanceDTO { programId: string; title: string; allocation: ProgramBudgetRevisionDTO | null; allocationRevisions: ProgramBudgetRevisionDTO[]; expenditures: ProgramExpenditureDTO[]; liquidations: LiquidationDTO[]; totals: { plannedCash: string; plannedInKind: string; pendingActual: string; verifiedActual: string; remaining: string; variance: string }; }
