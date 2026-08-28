import { NextResponse } from "next/server";
import { financeAnchorErrorCode, submitFinanceIntegrityAnchor } from "@/lib/integrity/provider";
import { isFinanceIntegrityEnabled } from "@/lib/integrity/feature";
import type { ClaimedFinanceIntegrityProof } from "@/lib/integrity/types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFinanceIntegrityEnabled()) return NextResponse.json({ data: { skipped: true, reason: "finance_integrity_disabled" } });

  const admin = createAdminClient();
  const claim = await admin.rpc("phase5_claim_finance_integrity_proofs", { p_limit: 20, p_lease_seconds: 300 });
  if (claim.error) return NextResponse.json({ error: "Unable to claim finance integrity proofs" }, { status: 500 });
  const proofs = (claim.data ?? []) as ClaimedFinanceIntegrityProof[];
  let anchored = 0;
  let retryScheduled = 0;
  let finalizeFailures = 0;

  for (const proof of proofs) {
    try {
      const receipt = await submitFinanceIntegrityAnchor(proof);
      const finalized = await admin.rpc("phase5_finalize_finance_integrity_proof", {
        p_proof_id: proof.id,
        p_claim_token: proof.claimToken,
        p_outcome: "anchored",
        p_network_key: receipt.networkKey,
        p_transaction_hash: receipt.transactionHash,
        p_block_reference: receipt.blockReference,
        p_contract_reference: receipt.contractReference,
        p_error_code: null,
      });
      if (finalized.error) finalizeFailures += 1;
      else anchored += 1;
    } catch (error) {
      const finalized = await admin.rpc("phase5_finalize_finance_integrity_proof", {
        p_proof_id: proof.id,
        p_claim_token: proof.claimToken,
        p_outcome: "retry",
        p_network_key: null,
        p_transaction_hash: null,
        p_block_reference: null,
        p_contract_reference: null,
        p_error_code: financeAnchorErrorCode(error),
      });
      if (finalized.error) finalizeFailures += 1;
      else retryScheduled += 1;
    }
  }
  if (finalizeFailures) return NextResponse.json({ error: "One or more anchor outcomes could not be finalized", data: { claimed: proofs.length, anchored, retryScheduled, finalizeFailures } }, { status: 500 });
  return NextResponse.json({ data: { claimed: proofs.length, anchored, retryScheduled, finalizeFailures: 0 } });
}

export const GET = POST;
