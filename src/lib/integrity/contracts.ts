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
  syntheticUserIds: z.array(id).max(1000).default([]),
  syntheticSourceIds: z.array(id).max(5000).default([]),
  providerKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).default("unconfigured"),
  networkKey: boundedKey.nullable().default(null),
  contractReference: z.string().trim().min(1).max(200).nullable().default(null),
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
