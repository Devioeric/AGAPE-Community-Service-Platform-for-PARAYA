"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Banknote, CheckCircle2, XCircle, ExternalLink, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

interface PendingProposal {
  id:                   string;
  title:                string;
  rationale:            string;
  budget:               number | null;
  is_income_generating: boolean;
  timeline_start:       string | null;
  timeline_end:         string | null;
  created_at:           string;
  barangays:            { name: string } | null;
  submitter:            { full_name: string | null; role: string | null } | null;
  proposal_sdg_alignment: { sdg_number: number }[];
}

interface RecentItem {
  id:                 string;
  title:              string;
  budget:             number | null;
  finance_cleared_at: string | null;
  finance_notes:      string | null;
  status:             string;
  barangays:          { name: string } | null;
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const fmtPeso = (n: number | null) => n != null ? `₱${n.toLocaleString()}` : "—";

export default function FinanceQueuePage() {
  const [pending, setPending] = useState<PendingProposal[]>([]);
  const [recent,  setRecent]  = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState<string | null>(null);

  const [clear,  setClear]  = useState<{ proposal: PendingProposal; notes: string } | null>(null);
  const [reject, setReject] = useState<{ proposal: PendingProposal; notes: string } | null>(null);
  const [detail, setDetail] = useState<PendingProposal | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/proposals/finance-queue");
    if (res.ok) {
      const j = await res.json();
      setPending(j.data?.pending ?? []);
      setRecent (j.data?.recent  ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markCleared(proposal: PendingProposal, notes: string) {
    setBusy(proposal.id);
    const res = await fetch(`/api/proposals/${proposal.id}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_finance_cleared", finance_notes: notes || null }),
    });
    setBusy(null);
    if (res.ok) {
      toast.success("Budget cleared. PARAYA can now approve the proposal.");
      setClear(null);
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to clear budget.");
    }
  }

  async function reject_(proposal: PendingProposal, notes: string) {
    if (!notes.trim()) {
      toast.error("Revision notes are required when sending a proposal back.");
      return;
    }
    setBusy(proposal.id);
    const res = await fetch(`/api/proposals/${proposal.id}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_revisions", notes }),
    });
    setBusy(null);
    if (res.ok) {
      toast.success("Sent back to the proponent with your notes.");
      setReject(null);
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to send back.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Finance Clearance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Proposals waiting on budget clearance. Approving here marks finance_clearance and unblocks PARAYA to advance the proposal to approved status.
        </p>
      </div>

      {/* Pending queue */}
      <Card className="border-border shadow-card">
        <CardHeader className="flex flex-row items-center justify-between pb-4 pt-5 px-6">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Banknote className="w-4 h-4" /> {pending.length} awaiting clearance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-2">
          {pending.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Queue is clear. Nothing waiting on you.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((p) => (
                <li key={p.id} className="py-5 first:pt-2">
                  <div className="flex items-start justify-between gap-6 flex-wrap lg:flex-nowrap">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-semibold text-foreground">{p.title}</p>
                        {p.is_income_generating && (
                          <Badge className="bg-warning/10 text-warning font-normal">Income-generating</Badge>
                        )}
                        {p.barangays?.name && (
                          <Badge variant="outline" className="font-normal">{p.barangays.name}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-x-4 gap-y-1 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> {fmtPeso(p.budget)}</span>
                        <span>{fmtDate(p.timeline_start)} → {fmtDate(p.timeline_end)}</span>
                        <span>Submitted by {p.submitter?.full_name ?? "Unknown"} ({(p.submitter?.role ?? "—").replace(/_/g, " ")})</span>
                      </div>
                      <p className="text-sm text-foreground/70 line-clamp-2 leading-relaxed">{p.rationale}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        onClick={() => setDetail(p)}
                        className="gap-1.5 h-9"
                      >
                        <ExternalLink className="w-4 h-4" /> Details
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy === p.id}
                        className="gap-1.5 h-9 border-danger/30 text-danger hover:bg-danger/5 hover:text-danger"
                        onClick={() => setReject({ proposal: p, notes: "" })}
                      >
                        <XCircle className="w-4 h-4" /> Send back
                      </Button>
                      <Button
                        disabled={busy === p.id}
                        className="gap-1.5 h-9 bg-primary hover:bg-primary-dark text-white"
                        onClick={() => setClear({ proposal: p, notes: "" })}
                      >
                        {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Clear budget
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent clearances */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4" /> Recently cleared
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No clearances yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="py-2 px-3">Proposal</th>
                    <th className="py-2 px-3">Barangay</th>
                    <th className="py-2 px-3">Budget</th>
                    <th className="py-2 px-3">Cleared</th>
                    <th className="py-2 px-3">Current status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-3 font-medium text-foreground">
                        {r.title}
                        {r.finance_notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.finance_notes}</p>}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">{r.barangays?.name ?? "—"}</td>
                      <td className="py-3 px-3 text-muted-foreground">{fmtPeso(r.budget)}</td>
                      <td className="py-3 px-3 text-muted-foreground">{fmtDate(r.finance_cleared_at)}</td>
                      <td className="py-3 px-3 capitalize text-muted-foreground">{r.status.replace(/_/g, " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clear dialog */}
      <Dialog open={!!clear} onOpenChange={(o) => !o && setClear(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear budget for this proposal?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-foreground/80">{clear?.proposal.title}</p>
            <p className="text-xs text-muted-foreground">Total budget: {fmtPeso(clear?.proposal.budget ?? null)}</p>
            <div className="space-y-1">
              <Label htmlFor="clear-notes">Notes (optional)</Label>
              <Textarea id="clear-notes" rows={3}
                placeholder="Any caveats or conditions to record on the proposal"
                value={clear?.notes ?? ""}
                onChange={(e) => clear && setClear({ ...clear, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClear(null)}>Cancel</Button>
            <Button onClick={() => clear && markCleared(clear.proposal, clear.notes)}>Clear budget</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!reject} onOpenChange={(o) => !o && setReject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back for revisions?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-foreground/80">{reject?.proposal.title}</p>
            <p className="text-xs text-muted-foreground">
              The proposal will return to the proponent with your notes. They can revise and resubmit.
            </p>
            <div className="space-y-1">
              <Label htmlFor="reject-notes">Notes <span className="text-danger">*</span></Label>
              <Textarea id="reject-notes" rows={3}
                placeholder="What needs to change in the budget? (required)"
                value={reject?.notes ?? ""}
                onChange={(e) => reject && setReject({ ...reject, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReject(null)}>Cancel</Button>
            <Button className="bg-danger hover:bg-danger/90"
              onClick={() => reject && reject_(reject.proposal, reject.notes)}>
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail side panel (full rationale + SDG) */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
            <SheetTitle className="font-heading text-xl leading-snug">
              {detail?.title ?? "Proposal Details"}
            </SheetTitle>
            {detail && (
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {detail.is_income_generating && (
                  <Badge className="bg-warning/10 text-warning font-normal">Income-generating</Badge>
                )}
                {detail.barangays?.name && (
                  <Badge variant="outline" className="font-normal">{detail.barangays.name}</Badge>
                )}
              </div>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Key facts grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Budget</p>
                <p className="text-foreground mt-0.5">{fmtPeso(detail?.budget ?? null)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Income-generating</p>
                <p className="text-foreground mt-0.5">{detail?.is_income_generating ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Timeline</p>
                <p className="text-foreground mt-0.5">
                  {fmtDate(detail?.timeline_start ?? null)} → {fmtDate(detail?.timeline_end ?? null)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Barangay</p>
                <p className="text-foreground mt-0.5">{detail?.barangays?.name ?? "—"}</p>
              </div>
            </div>

            {/* SDG alignment */}
            {(detail?.proposal_sdg_alignment ?? []).length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">SDG Alignment</p>
                  <div className="flex gap-1 flex-wrap">
                    {detail?.proposal_sdg_alignment.map((s) => (
                      <Badge key={s.sdg_number} variant="outline">SDG {s.sdg_number}</Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Rationale */}
            {detail?.rationale && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Rationale</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{detail.rationale}</p>
                </div>
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-border px-6 py-4 flex justify-end">
            <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
