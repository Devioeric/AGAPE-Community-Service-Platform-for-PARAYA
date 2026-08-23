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
export interface ProposalTargetAreaDTO { id: string; barangayId: string; sitioId: string | null; isLead: boolean; }
export interface BeneficiaryEstimateDTO { id: string; categoryCode: string; calculatedCount: number | null; suppressed: boolean; finalCount: number; source: string; asOfDate: string; overrideReason: string | null; }
export interface ProposalVersionDTO { id: string; versionNumber: number; canonicalHash: string; createdAt: string; reason: string; }
export interface ProposalDTO { id: string; title: string; status: ProposalStatus; originChannel: "paraya_internal" | "partner_document" | "barangay_referral"; originatingPartnerId: string | null; responsibleOfficerId: string; rowVersion: number; targets: ProposalTargetAreaDTO[]; beneficiaryEstimates: BeneficiaryEstimateDTO[]; activeVersion: ProposalVersionDTO | null; }
export interface ProposalBudgetRevisionDTO { id: string; proposalId: string; revisionNumber: number; status: "draft" | "submitted" | "returned" | "cleared" | "superseded"; currency: "PHP"; cashTotal: string; inKindTotal: string; zeroCash: boolean; canonicalHash: string | null; rowVersion: number; }
export interface FinanceProposalDTO { proposal: ProposalDTO; budget: ProposalBudgetRevisionDTO; fundingCashTotal: string; reconciled: boolean; }
export interface ProgramHandoffDTO { id: string; proposalId: string; proposalVersionId: string; budgetRevisionId: string; programId: string; createdAt: string; }
export interface ProgramBudgetRevisionDTO { id: string; programId: string; revisionNumber: number; status: "draft" | "active" | "superseded"; cashTotal: string; inKindTotal: string; rowVersion: number; }
export interface ProgramExpenditureDTO { id: string; programId: string; budgetItemId: string; amount: string; status: "pending" | "verified" | "returned" | "voided" | "replaced"; receiptExceptionReason: string | null; rowVersion: number; }
export interface LiquidationDTO { id: string; programId: string; status: "draft" | "submitted" | "returned" | "verified" | "voided"; totalSubmitted: string; rowVersion: number; }
export interface ProgramFinanceDTO { programId: string; title: string; allocation: ProgramBudgetRevisionDTO | null; expenditures: ProgramExpenditureDTO[]; liquidations: LiquidationDTO[]; totals: { plannedCash: string; pendingActual: string; verifiedActual: string; remaining: string }; }
