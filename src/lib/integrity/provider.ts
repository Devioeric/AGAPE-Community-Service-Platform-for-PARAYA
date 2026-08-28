import { createHash } from "node:crypto";
import { anchorRelayRequestSchema, anchorRelayResponseSchema } from "./contracts";
import type { ClaimedFinanceIntegrityProof } from "./types";

export type FinanceAnchorReceipt = {
  transactionHash: string;
  networkKey: string;
  blockReference: string | null;
  contractReference: string | null;
};

function syntheticReceipt(proof: ClaimedFinanceIntegrityProof): FinanceAnchorReceipt {
  const transactionHash = createHash("sha256")
    .update(`agape:synthetic-anchor:${proof.id}:${proof.canonicalHash}`)
    .digest("hex");
  return {
    transactionHash,
    networkKey: "synthetic-local",
    blockReference: `synthetic-${proof.sourceVersion}`,
    contractReference: null,
  };
}

export async function submitFinanceIntegrityAnchor(proof: ClaimedFinanceIntegrityProof): Promise<FinanceAnchorReceipt> {
  if (proof.dataMode === "synthetic") return syntheticReceipt(proof);

  const provider = process.env.AGAPE_BLOCKCHAIN_ANCHOR_PROVIDER;
  const endpoint = process.env.AGAPE_BLOCKCHAIN_ANCHOR_ENDPOINT;
  const apiKey = process.env.AGAPE_BLOCKCHAIN_ANCHOR_API_KEY;
  if (!provider || provider === "disabled" || provider !== proof.providerKey || !endpoint || !apiKey) {
    throw new Error("provider_not_configured");
  }
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("provider_endpoint_not_https");

  const body = anchorRelayRequestSchema.parse({
    schema: "agape.finance.anchor-request.v1",
    proofId: proof.id,
    sourceType: proof.sourceType,
    sourceVersion: proof.sourceVersion,
    canonicalSchema: proof.canonicalSchema,
    canonicalHash: proof.canonicalHash,
  });
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": proof.id },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  const receipt = anchorRelayResponseSchema.safeParse(await response.json().catch(() => null));
  if (!receipt.success) throw new Error("provider_invalid_receipt");
  if (proof.networkKey && receipt.data.networkKey !== proof.networkKey) throw new Error("provider_network_mismatch");
  return {
    transactionHash: receipt.data.transactionHash,
    networkKey: receipt.data.networkKey,
    blockReference: receipt.data.blockReference ?? null,
    contractReference: receipt.data.contractReference ?? proof.contractReference,
  };
}

export function financeAnchorErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "provider_unknown_error";
  return /^[a-z][a-z0-9_]{0,79}$/.test(message) ? message : "provider_unknown_error";
}
