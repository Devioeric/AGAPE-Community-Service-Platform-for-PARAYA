"use client";

import { useCallback, useEffect, useState } from "react";
import type { FinanceIntegrityProofDTO, FinanceIntegritySourceType } from "@/lib/integrity/types";
import { Empty, Field, Panel, Phase2Notice, StatusPill, jsonRequest, phase2Api, primaryButton, secondaryButton } from "@/components/phase2/Phase2Ui";

type BudgetSource = { id: string; status: string; revisionNumber: number; canonicalHash: string | null; rowVersion: number } | null;
type LiquidationSource = { id: string; status: string; revisionNumber: number; totalSubmitted: string; rowVersion: number };

export function FinanceIntegrityPanel({ enabled, canRead, canRequest, budget, liquidations }: {
  enabled: boolean; canRead: boolean; canRequest: boolean; budget: BudgetSource; liquidations: LiquidationSource[];
}) {
  const [proofs, setProofs] = useState<FinanceIntegrityProofDTO[]>([]);
  const [busySource, setBusySource] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" | "success" } | null>(null);
  const load = useCallback(async () => {
    if (!enabled || !canRead) return setProofs([]);
    try { setProofs(await phase2Api<FinanceIntegrityProofDTO[]>("/api/v2/finance-integrity/proofs")); }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : "Unable to load integrity proofs", tone: "error" }); }
  }, [canRead, enabled]);
  useEffect(() => { void load(); }, [load]);

  async function requestProof(sourceType: FinanceIntegritySourceType, sourceId: string, expectedVersion: number) {
    setBusySource(sourceId); setMessage(null);
    try {
      await phase2Api("/api/v2/finance-integrity/proofs", jsonRequest("POST", { sourceType, sourceId, expectedVersion }));
      setMessage({ text: "Integrity proof queued. Only the canonical hash and minimal proof metadata will leave AGAPE.", tone: "success" });
      await load();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Unable to request integrity proof", tone: "error" }); }
    finally { setBusySource(null); }
  }

  async function copyVerificationLink(code: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/verify/finance/${code}`);
    setMessage({ text: "Public verification link copied.", tone: "success" });
  }

  const eligibleLiquidations = liquidations.filter((item) => item.status === "verified");
  return <Panel title="Tamper-evident financial proofs" description="Anchor Finance-cleared budget snapshots and Finance-verified liquidation summaries without sending descriptions, payees, receipts, contacts, or documents.">
    {!enabled && <Phase2Notice message="Finance integrity is off. Existing finance workflows continue normally; no blockchain request will be made." />}
    {message && <Phase2Notice message={message.text} tone={message.tone} />}
    {enabled && canRequest && <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-md border p-4"><h3 className="font-medium">Cleared proposal budget</h3>{budget?.status === "cleared" && budget.canonicalHash ? <><p className="mt-1 text-sm text-slate-600">Revision {budget.revisionNumber} · {budget.canonicalHash.slice(0, 16)}…</p><button className={`${primaryButton} mt-3`} disabled={busySource === budget.id} onClick={() => void requestProof("finance_cleared_budget", budget.id, budget.rowVersion)}>Queue budget proof</button></> : <p className="mt-2 text-sm text-slate-500">Select a Finance-cleared proposal with a frozen hash.</p>}</div>
      <div className="rounded-md border p-4"><h3 className="font-medium">Verified liquidations</h3>{eligibleLiquidations.length === 0 ? <p className="mt-2 text-sm text-slate-500">Select a program with a Finance-verified liquidation.</p> : <div className="mt-2 space-y-2">{eligibleLiquidations.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span>Revision {item.revisionNumber} · PHP {item.totalSubmitted}</span><button className={secondaryButton} disabled={busySource === item.id} onClick={() => void requestProof("verified_liquidation", item.id, item.rowVersion)}>Queue proof</button></div>)}</div>}</div>
    </div>}
    {enabled && canRead && <div className="space-y-3"><h3 className="font-medium">Proof history</h3>{proofs.length === 0 ? <Empty>No integrity proofs have been requested.</Empty> : proofs.map((proof) => <article className="rounded-md border p-4 text-sm" key={proof.id}><div className="flex flex-wrap items-center justify-between gap-2"><b>{proof.sourceLabel} · revision {proof.sourceVersion}</b><div className="flex gap-2"><StatusPill value={proof.anchorStatus} /><StatusPill value={proof.sourceValidity} /></div></div><dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Record" value={proof.sourceType === "finance_cleared_budget" ? "Cleared budget" : "Verified liquidation"} /><Field label="Hash" value={`${proof.canonicalHash.slice(0, 20)}…`} /><Field label="Network" value={proof.networkKey ?? "Not anchored"} /><Field label="Anchored" value={proof.anchoredAt ? new Date(proof.anchoredAt).toLocaleString() : "Pending"} /></dl><button className={`${secondaryButton} mt-3`} onClick={() => void copyVerificationLink(proof.verificationCode)}>Copy verification link</button></article>)}</div>}
  </Panel>;
}
