import { z } from "zod";
import { claimedFinanceIntegrityProofSchema } from "./contracts";
import { financeAnchorRequest, financeAnchorErrorCode, relayOperation, retryableAnchorError, simulatedTransaction } from "./provider";
import { verifyFinanceCommitment } from "./verification";
import type { ClaimedFinanceIntegrityProof } from "./types";

type Rpc = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export async function runFinanceIntegrityTick(db: Rpc, reconciliationOnly = false) {
  const started = Date.now();
  const claimed = await db.rpc("phase5_claim_finance_integrity_proofs_v2", { p_limit: 5, p_lease_seconds: 120, p_reconciliation_only: reconciliationOnly });
  if (claimed.error) throw new Error("claim_unavailable");
  const proofs = z.array(claimedFinanceIntegrityProofSchema).parse(claimed.data);
  const summary = { claimed: proofs.length, anchored: 0, pending: 0, paused: 0, cancelled: 0, retryScheduled: 0, finalizeFailures: 0, deferred: 0 };
  const finalize = async (p: ClaimedFinanceIntegrityProof, outcome: string, chainResult: string, receipt?: { transactionHash: string; blockNumber?: string; blockHash?: string }, code: string | null = null) => {
    const r = await db.rpc("phase5_finalize_finance_integrity_proof_v2", { p_proof_id: p.id, p_claim_token: p.claimToken, p_outcome: outcome, p_target_fingerprint: p.target.fingerprint, p_chain_result: chainResult,
      p_transaction_hash: receipt?.transactionHash ?? null, p_block_number: receipt?.blockNumber ?? null, p_block_hash: receipt?.blockHash ?? null, p_error_code: code });
    if (r.error) summary.finalizeFailures++;
    else if (outcome === "retry") summary.retryScheduled++;
    else if (outcome === "anchored" || outcome === "pending" || outcome === "paused" || outcome === "cancelled") summary[outcome]++;
  };
  const processProof = async (p: ClaimedFinanceIntegrityProof) => {
    try {
      financeAnchorRequest(p); // Validate configuration before reserving an external dispatch.
      if (!p.dispatchReservedAt) {
        if (reconciliationOnly) { summary.deferred++; return; }
        const reserved = await db.rpc("phase5_reserve_integrity_dispatch", { p_proof_id: p.id, p_claim_token: p.claimToken });
        if (reserved.error) { summary.deferred++; return; } // Lease recovery; no external request made.
      }
      if (p.target.execution === "simulated") {
        await finalize(p, "anchored", "simulated", { transactionHash: simulatedTransaction(p) }); return;
      }
      let op = await relayOperation(p, p.sourceValidity !== "active" ? "cancel" : p.dispatchReservedAt ? "read" : "submit");
      // Lost request/response: replay exactly the same durable operation key, never a new identity.
      if (op === null && p.sourceValidity === "active" && !reconciliationOnly) op = await relayOperation(p, "submit");
      if (!op) { await finalize(p, "pending", "pending"); return; }
      if (op.state === "cancelled") { await finalize(p, "cancelled", "pending"); return; }
      if (op.state === "paused") { await finalize(p, "paused", "pending", undefined, op.errorCode ?? "relay_paused"); return; }
      if (!op.receipt) {
        if (p.dispatchReservedAt && Date.now() - Date.parse(p.dispatchReservedAt) > 86_400_000) await finalize(p, "paused", "pending", undefined, "pending_needs_review");
        else await finalize(p, "pending", "pending");
        return;
      }
      const checked = await verifyFinanceCommitment({ ...p, transactionHash: op.receipt.transactionHash, receiptBlockNumber: op.receipt.blockNumber, receiptBlockHash: op.receipt.blockHash });
      if (checked.status === "verified") await finalize(p, "anchored", "verified", op.receipt);
      else if (checked.status === "mismatch") await finalize(p, "paused", "mismatch", op.receipt, "receipt_mismatch");
      else await finalize(p, "pending", checked.status, op.receipt, checked.status === "unavailable" ? "verification_unavailable" : null);
    } catch (error) {
      const code = financeAnchorErrorCode(error);
      await finalize(p, retryableAnchorError(code) ? "retry" : "paused", "unavailable", undefined, code);
    }
  };
  let cursor = 0;
  const lane = async () => { while (cursor < proofs.length) { if (Date.now() - started >= 25_000) break; await processProof(proofs[cursor++]); } };
  await Promise.all([lane(), lane()]);
  summary.deferred += proofs.length - cursor;
  return summary;
}
