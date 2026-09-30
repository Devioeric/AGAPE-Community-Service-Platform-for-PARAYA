"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { financeIntegrityVerificationSchema } from "@/lib/integrity/contracts";
import type { FinanceIntegrityVerificationDTO } from "@/lib/integrity/types";
import { Field, Phase2Notice, secondaryButton } from "@/components/phase2/Phase2Ui";
import { IntegrityRequestGate, canRetryIntegrityRead, executionLabel, integrityErrorMessage, integrityRequest, safeExplorerLink, verificationLabel } from "./integrity-client";

export function FinanceIntegrityVerification({ code }: { code: string }) {
  const [proof, setProof] = useState<FinanceIntegrityVerificationDTO | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const requests = useRef(new IntegrityRequestGate());
  const selectedCode = useRef(code);
  selectedCode.current = code;

  const load = useCallback(async (reset = false) => {
    const request = requests.current.begin();
    setLoading(true); setError(null);
    if (reset) setProof(null);
    try {
      const result = await integrityRequest(`/api/v2/finance-integrity/verify/${encodeURIComponent(code)}`, financeIntegrityVerificationSchema, { signal: request.signal });
      if (request.current() && selectedCode.current === code) setProof(result);
    } catch (cause) {
      if (request.current() && selectedCode.current === code) setError(cause);
    } finally {
      if (request.current() && selectedCode.current === code) setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    const gate = requests.current;
    void load(true);
    return () => gate.cancel();
  }, [load]);

  const currentProof = proof?.verificationCode === code ? proof : null;
  const explorer = currentProof?.target?.execution === "sepolia" ? safeExplorerLink(currentProof.target.networkKey, currentProof.transactionHash) : null;
  return <section data-testid="finance-integrity-verification" aria-busy={loading} className="min-w-0 space-y-5 rounded-xl border bg-white p-4 shadow-sm sm:p-6">
    <header><h1 className="text-2xl font-semibold">AGAPE financial record verification</h1><p className="mt-1 text-sm text-slate-600">This page checks a cryptographic commitment. It does not disclose a financial document or process a payment.</p></header>
    {loading && <p role="status" className="text-sm text-slate-600">Checking proof and current source validity…</p>}
    {error != null && <div className="space-y-3"><Phase2Notice message={integrityErrorMessage(error)} tone="error" />{canRetryIntegrityRead(error) && <button className={secondaryButton} onClick={() => void load()}>Retry verification</button>}</div>}
    {currentProof && <>
      <p className="text-sm font-medium">{executionLabel(currentProof.target?.execution)}</p>
      <Phase2Notice
        message={error != null || loading ? "Current verification is not available yet. The commitment below is the last received record, not a fresh verification."
          : `${verificationLabel(currentProof.chainVerification)}. ${currentProof.chainVerification === "verified" ? "Receipt, commitment, pinned target, and required chain confirmation were checked using the configured read-only RPC provider." : currentProof.chainVerification === "unavailable" ? "The chain could not be checked. This does not establish tampering." : currentProof.chainVerification === "mismatch" ? "The chain evidence does not match the pinned commitment or target. Review is required." : currentProof.chainVerification === "simulated" ? "There is no blockchain transaction to verify." : currentProof.chainVerification === "legacy_unverified" ? "Historical receipt metadata is retained, but its blockchain target cannot be independently established." : "Relay acceptance or a transaction hash alone does not prove successful anchoring."}`}
        tone={!loading && error == null && currentProof.chainVerification === "mismatch" ? "error" : !loading && error == null && currentProof.chainVerification === "verified" ? "success" : "info"}
      />
      <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2">
        <Field label="Record" value={`${currentProof.sourceType === "finance_cleared_budget" ? "Finance-cleared budget" : "Finance-verified liquidation"} revision ${currentProof.sourceVersion}`} />
        <Field label="Processing status" value={currentProof.anchorStatus.replaceAll("_", " ")} />
        <Field label="Source validity (last checked)" value={currentProof.sourceValidity} />
        <Field label="Network" value={currentProof.target?.networkKey ?? currentProof.networkKey ?? "Not recorded"} />
        <div className="min-w-0 sm:col-span-2"><Field label="Canonical schema" value={<span className="break-all font-mono text-xs">{currentProof.canonicalSchema}</span>} /></div>
        <div className="min-w-0 sm:col-span-2"><Field label="Full SHA-256 commitment" value={<span className="break-all font-mono text-xs">{currentProof.canonicalHash}</span>} /></div>
        {currentProof.anchorReference && <div className="min-w-0 sm:col-span-2"><Field label="Opaque anchor reference" value={<span className="break-all font-mono text-xs">{currentProof.anchorReference}</span>} /></div>}
        {currentProof.target && <>
          <div className="min-w-0 sm:col-span-2"><Field label="Pinned target fingerprint" value={<span className="break-all font-mono text-xs">{currentProof.target.fingerprint}</span>} /></div>
          <div className="min-w-0 sm:col-span-2"><Field label="Contract" value={<span className="break-all font-mono text-xs">{currentProof.target.contractAddress ?? "Not applicable"}</span>} /></div>
        </>}
        {currentProof.transactionHash && currentProof.target?.execution !== "simulated" && <div className="min-w-0 sm:col-span-2"><Field label="Transaction hash (receipt metadata)" value={<span className="break-all font-mono text-xs">{currentProof.transactionHash}</span>} /></div>}
        {currentProof.receiptBlockNumber && <Field label="Receipt block" value={currentProof.receiptBlockNumber} />}
        {currentProof.receiptBlockHash && <div className="min-w-0 sm:col-span-2"><Field label="Receipt block hash" value={<span className="break-all font-mono text-xs">{currentProof.receiptBlockHash}</span>} /></div>}
      </dl>
      {currentProof.sourceValidity !== "active" && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">AGAPE marks this historical source as {currentProof.sourceValidity}. It is not the current source version. Stored commitments and any existing blockchain entries are retained; this notice does not by itself verify the blockchain proof.</p>}
      <p className="text-xs text-slate-600">AGAPE remains the operational source of truth. Independent chain checks do not trust the relay receipt alone, but still rely on the configured RPC provider.</p>
      <div className="flex flex-wrap gap-2">{!error && <button className={secondaryButton} disabled={loading} onClick={() => void load()}>{currentProof.chainVerification === "unavailable" ? "Retry verification" : "Recheck verification"}</button>}{explorer && <a className={secondaryButton} href={explorer} target="_blank" rel="noopener noreferrer">View on Sepolia explorer</a>}</div>
    </>}
  </section>;
}
