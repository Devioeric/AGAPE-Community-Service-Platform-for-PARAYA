import type { z } from "zod";
import type { financeIntegrityProofSchema, financeIntegrityVerificationSchema, financeIntegrityRuntimeOutputSchema, financeIntegrityTargetSchema, claimedFinanceIntegrityProofSchema } from "./contracts";

export type FinanceIntegrityProofDTO = z.infer<typeof financeIntegrityProofSchema>;
export type FinanceIntegrityVerificationDTO = z.infer<typeof financeIntegrityVerificationSchema>;
export type FinanceIntegrityRuntimeDTO = z.infer<typeof financeIntegrityRuntimeOutputSchema>;
export type FinanceIntegrityTarget = z.infer<typeof financeIntegrityTargetSchema>;
export type ClaimedFinanceIntegrityProof = z.infer<typeof claimedFinanceIntegrityProofSchema>;
export type FinanceIntegritySourceType = FinanceIntegrityProofDTO["sourceType"];
export type FinanceIntegrityAnchorStatus = FinanceIntegrityProofDTO["anchorStatus"];
export type FinanceIntegritySourceValidity = FinanceIntegrityProofDTO["sourceValidity"];
export type FinanceIntegrityRuntimeMode = FinanceIntegrityRuntimeDTO["mode"];
