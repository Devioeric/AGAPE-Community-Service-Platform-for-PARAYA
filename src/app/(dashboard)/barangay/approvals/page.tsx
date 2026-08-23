"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck, Loader2, CheckCircle2, XCircle, RefreshCw,
  ClipboardList, AlertCircle, User, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NeedRow {
  id:               string;
  title:            string;
  description:      string | null;
  category:         string;
  priority:         string;
  affected_count:   number | null;
  sitio:            string | null;
  approval_status:  string;
  approval_notes:   string | null;
  approved_at:      string | null;
  created_at:       string;
  users:            { full_name: string } | null;
  barangays:        { name: string } | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  pending_captain:  "bg-warning/10 text-warning border-warning/20 border",
  approved:         "bg-success/10 text-success border-success/20 border",
  rejected:         "bg-danger/10 text-danger border-danger/20 border",
  needs_revision:   "bg-info/10 text-info border-info/20 border",
};

const STATUS_LABEL: Record<string, string> = {
  pending_captain:  "Pending Review",
  approved:         "Approved",
  rejected:         "Rejected",
  needs_revision:   "Needs Revision",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-danger/10 text-danger border-danger/20 border",
  high:     "bg-warning/10 text-warning border-warning/20 border",
  medium:   "bg-info/10 text-info border-info/20 border",
  low:      "bg-muted/30 text-muted-foreground border border-border",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CaptainApprovalsPage() {
  const [needs, setNeeds]     = useState<NeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"pending" | "all">("pending");

  // Reject dialog state
  const [rejectTarget, setRejectTarget] = useState<NeedRow | null>(null);
  const [rejectAction, setRejectAction] = useState<"reject" | "needs_revision">("reject");
  const [rejectNotes,  setRejectNotes]  = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [busyId,       setBusyId]       = useState<string | null>(null);

  const fetchNeeds = useCallback(async () => {
    setLoading(true);
    const url = tab === "pending"
      ? "/api/community-needs?status=pending_captain"
      : "/api/community-needs?status=all";
    const res = await fetch(url);
    if (res.ok) {
      const j = await res.json();
      setNeeds(j.data ?? []);
    } else {
      toast.error("Failed to load community needs.");
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchNeeds(); }, [fetchNeeds]);

  const pendingCount = useMemo(
    () => needs.filter((n) => n.approval_status === "pending_captain").length,
    [needs]
  );

  async function approve(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/community-needs/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({}),
    });
    if (res.ok) {
      toast.success("Need approved and forwarded to PARAYA.");
      fetchNeeds();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to approve.");
    }
    setBusyId(null);
  }

  function openReject(need: NeedRow, action: "reject" | "needs_revision") {
    setRejectTarget(need);
    setRejectAction(action);
    setRejectNotes("");
  }

  async function submitReject() {
    if (!rejectTarget) return;
    if (!rejectNotes.trim()) {
      toast.error("Please provide a reason.");
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/community-needs/${rejectTarget.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ notes: rejectNotes.trim(), action: rejectAction }),
    });
    if (res.ok) {
      toast.success(rejectAction === "needs_revision" ? "Marked for revision." : "Rejected.");
      setRejectTarget(null);
      setRejectNotes("");
      fetchNeeds();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to submit.");
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" /> Community Needs — Approval Queue
          {pendingCount > 0 && (
            <Badge className="bg-warning text-white border-0 text-xs ml-1">{pendingCount} pending</Badge>
          )}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Review community needs submitted by your Barangay Secretary or Mother Leader. Approved needs are forwarded to PARAYA.
        </p>
      </div>

      {/* Tabs + refresh */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex gap-1">
          {([
            { key: "pending" as const, label: "Pending Review",  count: pendingCount },
            { key: "all"     as const, label: "All Submissions", count: needs.length  },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {tab === key && count > 0 && (
                <Badge className="ml-1 bg-muted/40 text-muted-foreground border-0 text-[10px]">{count}</Badge>
              )}
            </button>
          ))}
        </div>
        <Button
          onClick={fetchNeeds}
          disabled={loading}
          size="sm"
          variant="outline"
          className="gap-1.5 mb-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading community needs…
        </div>
      ) : needs.length === 0 ? (
        <Card className="border-border shadow-card">
          <CardContent className="py-16 text-center text-muted-foreground space-y-2">
            <ClipboardList className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm">
              {tab === "pending"
                ? "No pending submissions. You're all caught up."
                : "No community needs submitted yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {needs.map((n) => (
            <Card key={n.id} className="border-border shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <CardTitle className="font-heading text-base">{n.title}</CardTitle>
                      <Badge className={`${STATUS_BADGE[n.approval_status] ?? ""} capitalize text-[10px]`}>
                        {STATUS_LABEL[n.approval_status] ?? n.approval_status}
                      </Badge>
                      <Badge className={`${PRIORITY_BADGE[n.priority] ?? ""} capitalize text-[10px]`}>
                        {n.priority}
                      </Badge>
                      <Badge className="bg-muted text-muted-foreground border border-border capitalize text-[10px]">
                        {n.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {n.users?.full_name ?? "Unknown"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {fmtDate(n.created_at)}
                      </span>
                      {n.sitio && (
                        <span className="text-foreground/80">Sitio: <strong>{n.sitio}</strong></span>
                      )}
                      {n.affected_count != null && (
                        <span>{n.affected_count.toLocaleString()} affected</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {n.description && (
                  <p className="text-sm text-foreground/80 leading-relaxed">{n.description}</p>
                )}

                {/* Show approval notes for non-pending statuses */}
                {n.approval_status !== "pending_captain" && n.approval_notes && (
                  <div className={`p-3 rounded-lg text-xs border ${
                    n.approval_status === "approved"
                      ? "bg-success/5 border-success/20 text-success"
                      : n.approval_status === "rejected"
                        ? "bg-danger/5 border-danger/20 text-danger"
                        : "bg-info/5 border-info/20 text-info"
                  }`}>
                    <p className="font-medium mb-0.5">Captain&apos;s note:</p>
                    <p className="leading-relaxed">{n.approval_notes}</p>
                    {n.approved_at && (
                      <p className="text-muted-foreground mt-1">{fmtDate(n.approved_at)}</p>
                    )}
                  </div>
                )}

                {/* Action buttons — only for pending */}
                {n.approval_status === "pending_captain" && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <Button
                      onClick={() => approve(n.id)}
                      disabled={busyId === n.id}
                      size="sm"
                      className="bg-success hover:bg-success/90 text-white gap-1.5"
                    >
                      {busyId === n.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Approve &amp; Forward to PARAYA
                    </Button>
                    <Button
                      onClick={() => openReject(n, "needs_revision")}
                      disabled={busyId === n.id}
                      size="sm"
                      variant="outline"
                      className="border-info/30 text-info hover:bg-info/5 gap-1.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5" /> Ask for Revision
                    </Button>
                    <Button
                      onClick={() => openReject(n, "reject")}
                      disabled={busyId === n.id}
                      size="sm"
                      variant="outline"
                      className="border-danger/30 text-danger hover:bg-danger/5 gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Reject / Revision dialog ────────────────────────────────────── */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) setRejectTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              {rejectAction === "needs_revision"
                ? <><AlertCircle className="w-4 h-4 text-info" /> Request Revision</>
                : <><XCircle className="w-4 h-4 text-danger" /> Reject Need</>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {rejectTarget && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{rejectTarget.title}</span> — submitted by {rejectTarget.users?.full_name ?? "Unknown"}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="rej-notes">
                {rejectAction === "needs_revision" ? "What needs to be revised?" : "Reason for rejection"}
                <span className="text-danger ml-1">*</span>
              </Label>
              <Textarea
                id="rej-notes"
                rows={4}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder={rejectAction === "needs_revision"
                  ? "Explain what should be clarified or added…"
                  : "Explain why this need is being rejected…"}
                className="focus-visible:ring-primary/30 resize-none text-sm"
              />
              <p className="text-xs text-muted-foreground">The submitter will be notified with this message.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              onClick={submitReject}
              disabled={submitting || !rejectNotes.trim()}
              className={rejectAction === "needs_revision"
                ? "bg-info hover:bg-info/90 text-white"
                : "bg-danger hover:bg-danger/90 text-white"}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {rejectAction === "needs_revision" ? "Send for Revision" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
