import { createHash } from "node:crypto";
import type { FinanceIntegrityTarget } from "./types";

export function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
export function deriveAnchorReference(namespace: string, proofId: string) {
  return sha256(`agape.finance.anchor-reference.v2\n${namespace}\n${proofId.toLowerCase()}`);
}
export function targetFingerprint(t: FinanceIntegrityTarget) {
  return sha256(["agape.finance.target.v2", t.execution, t.providerKey, t.networkKey, String(t.chainId), t.contractAddress ?? "", t.bytecodeHash ?? "", t.namespace, t.confirmationPolicy].join("\n"));
}
export function assertTarget(t: FinanceIntegrityTarget, forDispatch = true) {
  if (targetFingerprint(t) !== t.fingerprint) throw new Error("target_fingerprint_mismatch");
  if (t.execution === "sepolia") throw new Error("sepolia_activation_gated");
  if (process.env.AGAPE_BLOCKCHAIN_EXECUTION !== t.execution) throw new Error("execution_mismatch");
  if (forDispatch && (process.env.AGAPE_BLOCKCHAIN_ANCHOR_PROVIDER !== t.providerKey || process.env.AGAPE_BLOCKCHAIN_NETWORK !== t.networkKey || (process.env.AGAPE_BLOCKCHAIN_CONTRACT_REFERENCE || null) !== t.contractAddress)) throw new Error("target_configuration_mismatch");
}
export function safeLocalEndpoint(value: string | undefined, kind: "relay" | "rpc") {
  if (process.env.AGAPE_BLOCKCHAIN_LOCAL_CONFIRM !== "agape-finance-integrity-local" || process.env.AGAPE_DB_TEST_ISOLATED !== "true") throw new Error("local_profile_required");
  const exact = kind === "relay" ? "http://127.0.0.1:56440" : "http://127.0.0.1:56445";
  if (value !== exact && value !== `${exact}/`) throw new Error("endpoint_not_allowed");
  return exact;
}
