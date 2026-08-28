export type FinanceIntegritySourceType = "finance_cleared_budget" | "verified_liquidation";
export type FinanceIntegrityAnchorStatus = "queued" | "submitting" | "anchored" | "failed" | "cancelled";
export type FinanceIntegritySourceValidity = "active" | "superseded" | "voided";
export type FinanceIntegrityRuntimeMode = "off" | "synthetic" | "live";

export interface FinanceIntegrityProofDTO {
  id: string;
  verificationCode: string;
  sourceType: FinanceIntegritySourceType;
  sourceId: string;
  sourceRootId: string;
  sourceLabel: string;
  sourceVersion: number;
  sourceRowVersion: number;
  canonicalSchema: "agape.finance.cleared-budget.v1" | "agape.finance.verified-liquidation.v1";
  canonicalHash: string;
  sourceValidity: FinanceIntegritySourceValidity;
  anchorStatus: FinanceIntegrityAnchorStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  networkKey: string | null;
  transactionHash: string | null;
  blockReference: string | null;
  contractReference: string | null;
  anchoredAt: string | null;
  rowVersion: number;
  createdAt: string;
}

export interface FinanceIntegrityVerificationDTO {
  schema: "agape.finance.integrity-verification.v1";
  verificationCode: string;
  sourceType: FinanceIntegritySourceType;
  sourceVersion: number;
  canonicalSchema: FinanceIntegrityProofDTO["canonicalSchema"];
  canonicalHash: string;
  sourceValidity: FinanceIntegritySourceValidity;
  anchorStatus: FinanceIntegrityAnchorStatus;
  networkKey: string | null;
  transactionHash: string | null;
  blockReference: string | null;
  contractReference: string | null;
  anchoredAt: string | null;
}

export interface FinanceIntegrityRuntimeDTO {
  component: "finance_integrity";
  mode: FinanceIntegrityRuntimeMode;
  providerKey: string;
  networkKey: string | null;
  contractReference: string | null;
  rowVersion: number;
  syntheticUserCount: number;
  syntheticSourceCount: number;
  serverEnabled?: boolean;
}

export interface ClaimedFinanceIntegrityProof {
  id: string;
  claimToken: string;
  sourceType: FinanceIntegritySourceType;
  sourceVersion: number;
  canonicalSchema: FinanceIntegrityProofDTO["canonicalSchema"];
  canonicalHash: string;
  dataMode: "synthetic" | "live";
  providerKey: string;
  networkKey: string;
  contractReference: string | null;
  attemptNumber: number;
}
