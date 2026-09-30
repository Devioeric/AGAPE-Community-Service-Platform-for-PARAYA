"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { financeIntegrityProofSchema } from "@/lib/integrity/contracts";
import type { FinanceIntegrityProofDTO, FinanceIntegritySourceType } from "@/lib/integrity/types";
import { Empty, Field, Panel, Phase2Notice, StatusPill, primaryButton, secondaryButton } from "@/components/phase2/Phase2Ui";
import { IntegrityReadError, IntegrityRequestGate, canResumeProof, canRetryIntegrityRead, executionLabel, integrityErrorMessage, integrityRequest, verificationLabel } from "./integrity-client";

type BudgetSource = { id: string; status: string; revisionNumber: number; canonicalHash: string | null; rowVersion: number } | null;
type LiquidationSource = { id: string; status: string; revisionNumber: number; totalSubmitted: string; rowVersion: number };
const proofListSchema = financeIntegrityProofSchema.array();

export function FinanceIntegrityPanel({ enabled, canRead, canRequest, budget, liquidations }: {
  enabled: boolean; canRead: boolean; canRequest: boolean; budget: BudgetSource; liquidations: LiquidationSource[];
}) {
  const [proofs, setProofs] = useState<FinanceIntegrityProofDTO[]>([]);
  const [readState, setReadState] = useState<"loading" | "success" | "error">("loading");
  const [readError, setReadError] = useState<unknown>(null);
  const [busySource, setBusySource] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" | "success" } | null>(null);
  const reads = useRef(new IntegrityRequestGate());
  const mutations = useRef(new IntegrityRequestGate());
  const mutationBusy = useRef(false);
  const sourceKey = `${budget?.id ?? ""}:${budget?.rowVersion ?? ""}|${liquidations.map((item) => `${item.id}:${item.rowVersion}`).join(",")}`;
  const scopeKey = `${enabled}:${canRead}:${canRequest}:${sourceKey}`;
  const currentScope = useRef(scopeKey);
  const contentScope = useRef(scopeKey);
  currentScope.current = scopeKey;

  const load = useCallback(async (reset = false) => {
    const request = reads.current.begin();
    const selectedScope = scopeKey;
    if (!enabled || !canRead) { setProofs([]); return; }
    if (reset) { contentScope.current = selectedScope; setProofs([]); }
    setReadState("loading"); setReadError(null);
    try {
      const result = await integrityRequest("/api/v2/finance-integrity/proofs", proofListSchema, { signal: request.signal });
      if (request.current() && currentScope.current === selectedScope) { contentScope.current = selectedScope; setProofs(result); setReadState("success"); }
    } catch (error) {
      if (request.current() && currentScope.current === selectedScope) {
        if (error instanceof IntegrityReadError && [401, 403].includes(error.status)) setProofs([]);
        setReadError(error); setReadState("error");
      }
    }
  }, [canRead, enabled, scopeKey]);

  useEffect(() => {
    const readGate = reads.current; const mutationGate = mutations.current;
    setMessage(null); setBusySource(null); mutationBusy.current = false;
    void load(true);
    return () => { readGate.cancel(); mutationGate.cancel(); mutationBusy.current = false; };
  }, [load]);

  async function mutate(url: string, body: unknown, busyId: string, successMessage: string) {
    if (!enabled || !canRequest || mutationBusy.current) return;
    mutationBusy.current = true;
    const request = mutations.current.begin(); const selectedScope = scopeKey;
    setBusySource(busyId); setMessage(null);
    try {
      const result = await integrityRequest(url, financeIntegrityProofSchema, {
        method: "POST", body: JSON.stringify(body), signal: request.signal,
      });
      if (!request.current() || currentScope.current !== selectedScope) return;
      // Keep the accepted proof and success notice even if the separate list read fails.
      contentScope.current = selectedScope;
      setProofs((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      setMessage({ text: successMessage, tone: "success" });
      void load();
    } catch (error) {
      if (request.current() && currentScope.current === selectedScope) setMessage({
        text: error instanceof IntegrityReadError && [400, 401, 403, 404, 409].includes(error.status)
          ? integrityErrorMessage(error)
          : "The proof request outcome could not be confirmed. Refresh proof history before requesting again; the server may already have recorded this request.",
        tone: "error",
      });
    } finally {
      if (request.current() && currentScope.current === selectedScope) { setBusySource(null); mutationBusy.current = false; }
    }
  }

  function requestProof(sourceType: FinanceIntegritySourceType, sourceId: string, expectedVersion: number) {
    return mutate("/api/v2/finance-integrity/proofs", { sourceType, sourceId, expectedVersion }, sourceId,
      "Proof request recorded. Confirmation is separate; only the canonical hash and minimal proof metadata leave AGAPE.");
  }

  async function copyVerificationLink(code: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/verify/finance/${code}`);
      setMessage({ text: "Public verification link copied.", tone: "success" });
    } catch { setMessage({ text: "Unable to copy the link. Use the Open verification link instead.", tone: "error" }); }
  }

  const eligibleLiquidations = liquidations.filter((item) => item.status === "verified");
  const visibleProofs = contentScope.current === scopeKey ? proofs : [];
  return <Panel title="Tamper-evident financial proofs" testId="finance-integrity-panel" description="Anchor Finance-cleared budget snapshots and Finance-verified liquidation summaries without sending descriptions, payees, receipts, contacts, or documents.">
    {!enabled && <Phase2Notice message="Finance integrity is off. Existing finance workflows continue normally; no new blockchain request will be made." />}
    {enabled && !canRead && <Phase2Notice message="You do not have permission to read financial-integrity proofs." />}
    {message && <Phase2Notice message={message.text} tone={message.tone} />}
    {enabled && canRequest && <div className="grid gap-3 md:grid-cols-2">
      <div className="min-w-0 rounded-md border p-4"><h3 className="font-medium">Cleared proposal budget</h3>{budget?.status === "cleared" && budget.canonicalHash ? <><p className="mt-1 break-words text-sm text-slate-600">Revision {budget.revisionNumber} · {budget.canonicalHash.slice(0, 16)}…</p><button className={`${primaryButton} mt-3`} disabled={busySource !== null} onClick={() => void requestProof("finance_cleared_budget", budget.id, budget.rowVersion)}>Queue budget proof</button></> : <p className="mt-2 text-sm text-slate-500">Select a Finance-cleared proposal with a frozen hash.</p>}</div>
      <div className="min-w-0 rounded-md border p-4"><h3 className="font-medium">Verified liquidations</h3>{eligibleLiquidations.length === 0 ? <p className="mt-2 text-sm text-slate-500">Select a program with a Finance-verified liquidation.</p> : <div className="mt-2 space-y-2">{eligibleLiquidations.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Revision {item.revisionNumber} · PHP {item.totalSubmitted}</span><button className={secondaryButton} disabled={busySource !== null} onClick={() => void requestProof("verified_liquidation", item.id, item.rowVersion)}>Queue proof</button></div>)}</div>}</div>
    </div>}
    {enabled && canRead && <div className="space-y-3" aria-busy={readState === "loading"}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Proof history</h3>{readState === "success" && <button className={secondaryButton} onClick={() => void load()}>Refresh proofs</button>}</div>
      {readState === "loading" && <p role="status" className="text-sm text-slate-600">Loading proofs…</p>}
      {readState === "error" && <div className="space-y-2"><Phase2Notice message={integrityErrorMessage(readError)} tone="error" />{canRetryIntegrityRead(readError) && <button className={secondaryButton} onClick={() => void load()}>Retry proof list</button>}</div>}
      {readState === "success" && visibleProofs.length === 0 && <Empty>No integrity proofs have been requested.</Empty>}
      {visibleProofs.map((proof) => <article className="min-w-0 rounded-md border p-4 text-sm" key={proof.id} data-testid={`integrity-proof-${proof.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-2"><b className="min-w-0 break-words">{proof.sourceLabel} · revision {proof.sourceVersion}</b><StatusPill value={proof.anchorStatus} /></div>
        <p className="mt-2 text-sm font-medium">{executionLabel(proof.target?.execution)}</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Record" value={proof.sourceType === "finance_cleared_budget" ? "Cleared budget" : "Verified liquidation"} />
          <Field label="Chain verification" value={verificationLabel(proof.chainVerification)} />
          <Field label="Source validity" value={<StatusPill value={proof.sourceValidity} />} />
          <Field label="SHA-256 commitment" value={<span className="break-all font-mono text-xs">{proof.canonicalHash}</span>} />
          <Field label="Network" value={proof.target?.networkKey ?? proof.networkKey ?? "Not recorded"} />
          <Field label="Receipt recorded" value={proof.anchoredAt ? new Date(proof.anchoredAt).toLocaleString() : "Awaiting confirmation"} />
        </dl>
        {proof.sourceValidity !== "active" && <p className="mt-3 text-sm text-amber-800">Historical source is {proof.sourceValidity}. Its commitment and any existing blockchain entry are retained; this is not the current source version.</p>}
        {proof.anchorStatus === "pending" && <p className="mt-3 text-sm text-slate-600">Submission is being reconciled. A transaction hash or relay acceptance alone is not verification.</p>}
        {proof.anchorStatus === "paused" && <p className="mt-3 text-sm text-amber-800">Processing is paused for operator review{proof.lastErrorCode ? ` (${proof.lastErrorCode.replaceAll("_", " ")})` : ""}. {canResumeProof(proof.anchorStatus, proof.lastErrorCode) ? "Resume retains the same proof and target." : "Relay or configuration intervention is required before this proof can continue."}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <a className={secondaryButton} href={`/verify/finance/${encodeURIComponent(proof.verificationCode)}`}>Open verification</a>
          <button className={secondaryButton} onClick={() => void copyVerificationLink(proof.verificationCode)}>Copy verification link</button>
          {canRequest && proof.target && canResumeProof(proof.anchorStatus, proof.lastErrorCode) && <button className={secondaryButton} disabled={busySource !== null} onClick={() => void mutate(`/api/v2/finance-integrity/proofs/${encodeURIComponent(proof.id)}/resume`, { expectedVersion: proof.rowVersion }, proof.id, "Resume recorded for the same proof and target. Verification is still required.")}>Resume proof</button>}
        </div>
      </article>)}
    </div>}
  </Panel>;
}
