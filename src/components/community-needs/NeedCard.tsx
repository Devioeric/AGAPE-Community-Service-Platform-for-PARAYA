"use client";

import { useState } from "react";
import { AlertCircle, Calendar, CheckCircle2, Loader2, MapPin, User, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CommunityNeedRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  affected_count: number | null;
  sitio: string | null;
  approval_status: string;
  approval_notes: string | null;
  approved_at: string | null;
  created_at: string;
  source?: string | null;
  users: { full_name: string } | null;
  barangays: { name: string } | null;
};

const statusStyle: Record<string, string> = {
  pending_paraya_review: "border-warning/25 bg-warning/10 text-warning",
  approved: "border-success/25 bg-success/10 text-success",
  rejected: "border-danger/25 bg-danger/10 text-danger",
  needs_revision: "border-info/25 bg-info/10 text-info",
};

export const NEED_STATUS_LABEL: Record<string, string> = {
  pending_paraya_review: "Pending review",
  needs_revision: "Needs revision",
  approved: "Approved",
  rejected: "Rejected",
};

const priorityStyle: Record<string, string> = {
  critical: "text-danger",
  high: "text-warning",
  medium: "text-info",
  low: "text-muted-foreground",
};

const SOURCE_LABEL: Record<string, string> = {
  household_profile: "From profiling data",
  community_profile: "From community profile",
  survey: "From survey data",
};

function sentenceCase(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function dateLabel(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-PH", { dateStyle: "medium" });
}

/** One need as a compact list row; long text and the Officer's note expand in place. */
export function NeedCard({
  need,
  canReview,
  busy,
  onApprove,
  onDecision,
}: {
  need: CommunityNeedRow;
  canReview: boolean;
  busy: boolean;
  onApprove: (need: CommunityNeedRow) => void;
  onDecision: (need: CommunityNeedRow, action: "reject" | "needs_revision") => void;
}) {
  const [open, setOpen] = useState(false);
  const pending = need.approval_status === "pending_paraya_review";
  // Many intake titles repeat the description; show it only when it adds something.
  const description = need.description && need.description.trim() !== need.title.trim() ? need.description : null;
  const note = !pending ? need.approval_notes : null;
  const expandable = (description?.length ?? 0) > 140 || (note?.length ?? 0) > 110 || Boolean(description?.includes("\n"));

  return (
    <li className={`px-4 py-3.5 sm:px-5 ${pending ? "bg-warning/[0.04]" : ""}`} data-status={need.approval_status}>
      <div className="min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-medium text-foreground">{need.title}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusStyle[need.approval_status] ?? "border-border text-muted-foreground"}`}>
              {NEED_STATUS_LABEL[need.approval_status] ?? need.approval_status.replaceAll("_", " ")}
            </span>
            {need.source && SOURCE_LABEL[need.source] && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{SOURCE_LABEL[need.source]}</span>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={`font-semibold ${priorityStyle[need.priority] ?? ""}`}>{sentenceCase(need.priority)} priority</span>
            <span>{sentenceCase(need.category)}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{need.barangays?.name ?? "Barangay not stated"}{need.sitio ? ` · ${need.sitio}` : ""}</span>
            {need.affected_count !== null && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden="true" />{need.affected_count.toLocaleString()} affected</span>}
            <span className="inline-flex items-center gap-1"><User className="h-3 w-3" aria-hidden="true" />{need.users?.full_name ?? "Submitter unavailable"}</span>
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" aria-hidden="true" />{dateLabel(need.created_at)}</span>
          </p>
          {description && <p className={`mt-1.5 text-sm leading-relaxed text-foreground/80 ${open ? "whitespace-pre-wrap" : "line-clamp-1"}`}>{description}</p>}
          {note && (
            <p className={`mt-1.5 text-xs leading-relaxed text-muted-foreground ${open ? "" : "line-clamp-1"}`}>
              <span className="font-medium text-foreground">Officer note{need.approved_at ? ` (${dateLabel(need.approved_at)})` : ""}:</span> {note}
            </p>
          )}
          {expandable && (
            <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline">
              {open ? "Show less" : "Show more"}
            </button>
          )}
        </div>
        {/* Review actions sit under the details so the details keep the full row width. */}
        {pending && canReview && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" className="h-8 gap-1.5 bg-success text-white hover:bg-success/90" disabled={busy} onClick={() => onApprove(need)}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve Need
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 border-info/30 text-info hover:bg-info/5" disabled={busy} onClick={() => onDecision(need, "needs_revision")}>
              <AlertCircle className="h-3.5 w-3.5" />Ask for Revision
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 border-danger/30 text-danger hover:bg-danger/5" disabled={busy} onClick={() => onDecision(need, "reject")}>
              <XCircle className="h-3.5 w-3.5" />Reject
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
