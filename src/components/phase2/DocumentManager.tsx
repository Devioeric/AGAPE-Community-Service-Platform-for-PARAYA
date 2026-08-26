"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Empty, Panel, Phase2Notice, StatusPill, inputClass, jsonRequest, phase2Api, primaryButton, secondaryButton, textareaClass } from "./Phase2Ui";

type Kind = "partnership" | "historical" | "proposal_budget" | "program_finance";
type DocumentRow = { id: string; type: string; name: string; mimeType: string; sizeBytes: number; scanStatus: string; createdAt: string; reviewedAt?: string | null };

export function DocumentManager({ kind, parentId, canUpload, canReview }: { kind: Kind; parentId: string; canUpload: boolean; canReview: boolean }) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | "risk_accept">("approve");
  const [reason, setReason] = useState("");
  const load = useCallback(async () => {
    try { setDocuments(await phase2Api(`/api/v2/documents/${kind}?parent_id=${encodeURIComponent(parentId)}`)); }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : "Unable to load documents", tone: "error" }); }
  }, [kind, parentId]);
  useEffect(() => { void load(); }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null);
    const form = new FormData(event.currentTarget); form.set("parent_id", parentId);
    try { await phase2Api(`/api/v2/documents/${kind}`, { method: "POST", body: form }); event.currentTarget.reset(); setMessage({ text: "Document uploaded to quarantine.", tone: "success" }); await load(); }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : "Upload failed", tone: "error" }); }
  }
  async function review() {
    if (!reviewing) return;
    try {
      const endpoint = decision === "risk_accept" ? `/api/v2/documents/${kind}/${reviewing}/risk-accept` : `/api/v2/documents/${kind}/${reviewing}/review`;
      const body = decision === "risk_accept" ? { reason } : { decision, reason };
      await phase2Api(endpoint, jsonRequest("POST", body));
      setReviewing(null); setReason(""); setMessage({ text: "Document review recorded.", tone: "success" }); await load();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Review failed", tone: "error" }); }
  }
  async function download(documentId: string) {
    try {
      const result = await phase2Api<{ url: string }>(`/api/v2/documents/${kind}/${documentId}`);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Download failed", tone: "error" }); }
  }

  return <Panel title="Private documents" description="New files remain quarantined. Downloads are parent-authorized, audited, and expire after five minutes." testId={`documents-${kind}`}>
    {message && <Phase2Notice message={message.text} tone={message.tone} />}
    {canUpload && <form onSubmit={upload} className="grid gap-2 md:grid-cols-4">
      <input className={inputClass} name="file" type="file" accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png" required />
      <input className={inputClass} name="document_type" placeholder="Document type" required />
      <select className={inputClass} name="visibility" defaultValue="paraya_only"><option value="paraya_only">PARAYA only</option>{kind === "partnership" && <option value="linked_barangay">Share with linked barangay</option>}</select>
      <button className={primaryButton}>Upload to quarantine</button>
    </form>}
    {documents.length === 0 ? <Empty>No document metadata is recorded.</Empty> : <div className="space-y-2">{documents.map((document) => <article key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
      <div><div className="font-medium">{document.name}</div><div className="text-xs text-slate-500">{document.type} · {(document.sizeBytes / 1024).toFixed(1)} KB · {new Date(document.createdAt).toLocaleDateString()}</div></div>
      <div className="flex items-center gap-2"><StatusPill value={document.scanStatus} />{["approved", "risk_accepted"].includes(document.scanStatus) && <button className={secondaryButton} onClick={() => void download(document.id)}>Audited download</button>}{canReview && document.scanStatus === "quarantined" && <button className={secondaryButton} onClick={() => setReviewing(document.id)}>Review</button>}</div>
    </article>)}</div>}
    {reviewing && <div className="space-y-3 rounded-md border bg-slate-50 p-4"><label className="text-sm font-medium">Decision<select className={`${inputClass} mt-1`} value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><option value="approve">Approve after review</option><option value="reject">Reject</option><option value="risk_accept">Accept documented risk</option></select></label><textarea className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record the review basis or risk justification" /><div className="flex gap-2"><button className={primaryButton} disabled={reason.trim().length < (decision === "risk_accept" ? 20 : decision === "reject" ? 10 : 5)} onClick={() => void review()}>Record decision</button><button className={secondaryButton} onClick={() => { setReviewing(null); setReason(""); }}>Cancel</button></div></div>}
  </Panel>;
}
