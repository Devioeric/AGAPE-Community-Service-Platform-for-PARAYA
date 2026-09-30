import { anchorRelayRequestV2Schema, anchorRelayOperationSchema } from "./contracts";
import { assertTarget, deriveAnchorReference, safeLocalEndpoint, sha256 } from "./target";
import type { ClaimedFinanceIntegrityProof } from "./types";

export function financeAnchorRequest(proof: ClaimedFinanceIntegrityProof) {
  if (proof.dataMode !== "synthetic" || proof.operationKey !== proof.id || deriveAnchorReference(proof.target.namespace, proof.id) !== proof.anchorReference) throw new Error("proof_identity_mismatch");
  assertTarget(proof.target);
  return anchorRelayRequestV2Schema.parse({ schema: "agape.finance.anchor-request.v2", proofId: proof.id, anchorReference: proof.anchorReference, targetFingerprint: proof.target.fingerprint, sourceType: proof.sourceType, sourceVersion: proof.sourceVersion, canonicalSchema: proof.canonicalSchema, canonicalHash: proof.canonicalHash });
}
export function simulatedTransaction(proof: ClaimedFinanceIntegrityProof) {
  return sha256(`agape:simulated-anchor:v2:${proof.target.fingerprint}:${proof.id}:${proof.canonicalHash}`);
}
export async function relayOperation(proof: ClaimedFinanceIntegrityProof, action: "submit" | "read" | "cancel") {
  const expected = financeAnchorRequest(proof);
  if (proof.target.execution === "simulated") throw new Error("simulation_has_no_relay");
  const base = safeLocalEndpoint(process.env.AGAPE_BLOCKCHAIN_ANCHOR_ENDPOINT, "relay");
  const key = process.env.AGAPE_BLOCKCHAIN_ANCHOR_API_KEY;
  if (!key || key.length < 32) throw new Error("relay_credential_missing");
  const suffix = action === "submit" ? "" : `/${proof.id}${action === "cancel" ? "/cancel" : ""}`;
  const response = await fetch(`${base}/v2/anchors${suffix}`, { method: action === "read" ? "GET" : "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": proof.id },
    ...(action === "submit" ? { body: JSON.stringify(expected) } : action === "cancel" ? { body: "{}" } : {}), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (response.status === 404 && action === "read") return null;
  if (!response.ok) throw new Error([401, 403].includes(response.status) ? "relay_credential_rejected" : response.status === 409 ? "relay_identity_conflict" : response.status === 429 ? "relay_rate_limited" : "relay_unavailable");
  const parsed = anchorRelayOperationSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error("relay_invalid_response");
  const op = parsed.data;
  if (op.request === null) {
    if (op.state !== "cancelled") throw new Error("relay_identity_mismatch");
  } else if (Object.entries(expected).some(([k, v]) => op.request?.[k as keyof typeof expected] !== v)) throw new Error("relay_identity_mismatch");
  if (op.receipt && (op.receipt.chainId !== proof.target.chainId || op.receipt.contractAddress.toLowerCase() !== proof.target.contractAddress)) throw new Error("relay_target_mismatch");
  return op;
}
const controlled = new Set(["proof_identity_mismatch", "target_fingerprint_mismatch", "sepolia_activation_gated", "execution_mismatch", "target_configuration_mismatch", "local_profile_required", "endpoint_not_allowed", "relay_credential_missing", "relay_credential_rejected", "relay_identity_conflict", "relay_identity_mismatch", "relay_target_mismatch", "relay_invalid_response", "relay_rate_limited", "relay_unavailable"]);
export function financeAnchorErrorCode(error: unknown) { return error instanceof Error && controlled.has(error.message) ? error.message : "relay_unavailable"; }
export function retryableAnchorError(code: string) { return code === "relay_unavailable" || code === "relay_rate_limited"; }
