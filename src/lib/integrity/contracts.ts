import { z } from "zod";

const id = z.string().uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const boundedKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

export const financeIntegrityRequestSchema = z.strictObject({
  sourceType: z.enum(["finance_cleared_budget", "verified_liquidation"]),
  sourceId: id,
  expectedVersion: z.number().int().positive(),
});

export const financeIntegrityRuntimeSchema = z.strictObject({
  mode: z.enum(["off", "synthetic", "live"]),
  expectedVersion: z.number().int().positive(),
  targetId: id.nullable(),
  syntheticUserIds: z.array(id).max(1000).optional(),
  syntheticSourceIds: z.array(id).max(5000).optional(),
});

const nullableText = z.string().nullable();
const sourceType = z.enum(["finance_cleared_budget", "verified_liquidation"]);
const canonicalSchema = z.enum(["agape.finance.cleared-budget.v1", "agape.finance.verified-liquidation.v1"]);
const anchorStatus = z.enum(["queued", "submitting", "pending", "anchored", "failed", "paused", "cancelled"]);
const chainVerification = z.enum(["simulated", "pending", "verified", "mismatch", "unavailable", "legacy_unverified"]);
const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const financeIntegrityTargetSchema = z.strictObject({
  id, providerKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  execution: z.enum(["simulated", "local_evm", "sepolia"]),
  networkKey: z.enum(["synthetic-local", "eip155:31337", "eip155:11155111"]),
  chainId: z.number().int().nonnegative(),
  contractAddress: z.string().regex(/^0x[0-9a-f]{40}$/).nullable(),
  bytecodeHash: hash.nullable(), namespace: hash,
  confirmationPolicy: z.enum(["simulated", "local_one_block", "sepolia_finalized"]),
  fingerprint: hash,
}).superRefine((t, ctx) => {
  const valid = t.execution === "simulated"
    ? t.chainId === 0 && t.networkKey === "synthetic-local" && t.confirmationPolicy === "simulated" && t.contractAddress === null && t.bytecodeHash === null
    : t.contractAddress !== null && t.bytecodeHash !== null && (t.execution === "local_evm"
      ? t.chainId === 31337 && t.networkKey === "eip155:31337" && t.confirmationPolicy === "local_one_block"
      : t.chainId === 11155111 && t.networkKey === "eip155:11155111" && t.confirmationPolicy === "sepolia_finalized");
  if (!valid) ctx.addIssue({ code: "custom", message: "Invalid target binding" });
});
const verificationFields = {
  verificationCode: id, sourceType, sourceVersion: z.number().int().positive(), canonicalSchema,
  canonicalHash: hash, sourceValidity: z.enum(["active", "superseded", "voided"]), anchorStatus,
  networkKey: nullableText, transactionHash: nullableText, blockReference: nullableText,
  contractReference: nullableText, anchoredAt: nullableText,
  target: financeIntegrityTargetSchema.nullable(), anchorReference: hash.nullable(),
  lastErrorCode: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/).nullable(),
  receiptBlockNumber: z.string().regex(/^\d+$/).nullable(), receiptBlockHash: txHash.nullable(), chainVerification,
};
export const financeIntegrityVerificationSchema = z.strictObject({ schema: z.literal("agape.finance.integrity-verification.v1"), ...verificationFields });
export const financeIntegrityProofSchema = z.strictObject({
  ...verificationFields, id, sourceId: id, sourceRootId: id, sourceLabel: nullableText,
  sourceRowVersion: z.number().int().positive(), attemptCount: z.number().int().nonnegative(),
  nextAttemptAt: nullableText, rowVersion: z.number().int().positive(), createdAt: z.string(),
});
export const financeIntegrityRuntimeOutputSchema = z.strictObject({
  component: z.literal("finance_integrity"), mode: z.enum(["off", "synthetic", "live"]),
  providerKey: z.string(), networkKey: nullableText, contractReference: nullableText,
  rowVersion: z.number().int().positive(), targetId: id.nullable(), target: financeIntegrityTargetSchema.nullable(),
  syntheticUserCount: z.number().int().nonnegative(), syntheticSourceCount: z.number().int().nonnegative(),
  syntheticUserIds: z.array(id), syntheticSourceIds: z.array(id), serverEnabled: z.boolean().optional(),
  readinessErrors: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)).max(20).optional(),
});
export const financeIntegrityResumeSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export const anchorRelayRequestV2Schema = z.strictObject({
  schema: z.literal("agape.finance.anchor-request.v2"), proofId: id, anchorReference: hash,
  targetFingerprint: hash, sourceType, sourceVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), canonicalSchema, canonicalHash: hash,
}).refine(r => r.canonicalSchema === (r.sourceType === "finance_cleared_budget" ? "agape.finance.cleared-budget.v1" : "agape.finance.verified-liquidation.v1"), "Source schema mismatch");
export const anchorRelayReceiptSchema = z.strictObject({
  transactionHash: txHash, chainId: z.number().int().positive(), contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  blockNumber: z.string().regex(/^\d+$/), blockHash: txHash, finality: z.enum(["pending", "local_one_block", "finalized"]),
});
export const anchorRelayOperationSchema = z.strictObject({
  schema: z.literal("agape.finance.anchor-operation.v2"), request: anchorRelayRequestV2Schema.nullable(),
  state: z.enum(["accepted", "prepared", "submitted", "confirmed", "cancelled", "paused"]),
  receipt: anchorRelayReceiptSchema.nullable(), errorCode: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/).nullable(),
});
export const claimedFinanceIntegrityProofSchema = z.strictObject({
  id, claimToken: id, sourceType, sourceVersion: z.number().int().positive(), canonicalSchema, canonicalHash: hash,
  dataMode: z.literal("synthetic"), providerKey: z.string(), networkKey: z.string(), contractReference: nullableText,
  attemptNumber: z.number().int().nonnegative(), target: financeIntegrityTargetSchema,
  anchorReference: hash, operationKey: id, dispatchReservedAt: nullableText, sourceValidity: z.enum(["active", "superseded", "voided"]),
  transactionHash: nullableText, receiptBlockNumber: z.string().regex(/^\d+$/).nullable(), receiptBlockHash: txHash.nullable(),
  anchorStatus, rowVersion: z.number().int().positive(),
});

export const publicVerificationCodeSchema = id;

export const anchorRelayResponseSchema = z.strictObject({
  transactionHash: z.string().regex(/^(0x)?[A-Fa-f0-9]{32,128}$/),
  networkKey: boundedKey,
  blockReference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/).nullable().optional(),
  contractReference: z.string().trim().min(1).max(200).nullable().optional(),
});

export const anchorRelayRequestSchema = z.strictObject({
  schema: z.literal("agape.finance.anchor-request.v1"),
  proofId: id,
  sourceType: z.enum(["finance_cleared_budget", "verified_liquidation"]),
  sourceVersion: z.number().int().positive(),
  canonicalSchema: z.enum(["agape.finance.cleared-budget.v1", "agape.finance.verified-liquidation.v1"]),
  canonicalHash: hash,
});
