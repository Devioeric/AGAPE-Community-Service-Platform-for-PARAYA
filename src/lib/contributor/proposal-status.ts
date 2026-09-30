// Status vocabulary for the Contributor proposal pages. Structured proposals
// move through the Phase 2 workflow; these helpers only describe it. Every
// transition is still decided by the server and a human PARAYA Officer.

export type ContributorProposalStatus =
  | "draft" | "submitted" | "pre_screening" | "evidence_review" | "finance_review"
  | "director_review" | "revisions_requested" | "approved" | "rejected";

export const PIPELINE_STAGES: ReadonlyArray<{ key: ContributorProposalStatus; label: string }> = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "pre_screening", label: "Pre-Screening" },
  { key: "evidence_review", label: "Evidence Review" },
  { key: "finance_review", label: "Finance Review" },
  { key: "director_review", label: "Final Review" },
  { key: "approved", label: "Approved" },
];

export const STATUS_LABEL: Record<ContributorProposalStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pre_screening: "Pre-Screening",
  evidence_review: "Evidence Review",
  finance_review: "Finance Review",
  director_review: "Final Review",
  revisions_requested: "Revisions Requested",
  approved: "Approved",
  rejected: "Rejected",
};

export const STATUS_BADGE: Record<ContributorProposalStatus, string> = {
  draft: "bg-muted text-muted-foreground border",
  submitted: "bg-info/10 text-info border-info/20 border",
  pre_screening: "bg-warning/10 text-warning border-warning/20 border",
  evidence_review: "bg-warning/10 text-warning border-warning/20 border",
  finance_review: "bg-warning/10 text-warning border-warning/20 border",
  director_review: "bg-warning/10 text-warning border-warning/20 border",
  revisions_requested: "bg-accent/15 text-accent-foreground border-accent/30 border",
  approved: "bg-success/10 text-success border-success/20 border",
  rejected: "bg-danger/10 text-danger border-danger/20 border",
};

/** Waiting on a PARAYA or Finance reviewer, not on the Contributor. */
export const IN_REVIEW_STATUSES: ReadonlySet<string> = new Set([
  "submitted", "pre_screening", "evidence_review", "finance_review", "director_review",
]);

export function isContributorProposalStatus(value: unknown): value is ContributorProposalStatus {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STATUS_LABEL, value);
}

export function statusLabel(status: string): string {
  return isContributorProposalStatus(status) ? STATUS_LABEL[status] : status.replaceAll("_", " ");
}

export function statusBadge(status: string): string {
  return isContributorProposalStatus(status) ? STATUS_BADGE[status] : STATUS_BADGE.draft;
}

/** Only drafts and returned proposals can be edited or (re)submitted by the Contributor. */
export function contributorCanEdit(status: string): boolean {
  return status === "draft" || status === "revisions_requested";
}

export type ContributorPhaseKey = "preparing" | "review" | "approved" | "closed";

export const PHASE_META: Record<ContributorPhaseKey, { label: string; description: string; color: string }> = {
  preparing: { label: "Preparing", description: "Drafts and proposals returned for revision", color: "bg-muted-foreground" },
  review: { label: "Under review", description: "With a PARAYA or Finance reviewer", color: "bg-warning" },
  approved: { label: "Approved", description: "Approved by a PARAYA Officer", color: "bg-success" },
  closed: { label: "Not approved", description: "Rejected proposals", color: "bg-danger" },
};

export function contributorPhase(status: string): ContributorPhaseKey {
  if (status === "approved") return "approved";
  if (status === "rejected") return "closed";
  if (IN_REVIEW_STATUSES.has(status)) return "review";
  return "preparing";
}

export interface ContributorProposalStats {
  total: number;
  draft: number;
  inReview: number;
  revisionsRequested: number;
  approved: number;
  rejected: number;
  cashRequested: number;
  cashApproved: number;
  phases: Record<ContributorPhaseKey, number>;
}

export function contributorProposalStats(rows: ReadonlyArray<{ status: string; cashTotal: number }>): ContributorProposalStats {
  const stats: ContributorProposalStats = {
    total: rows.length, draft: 0, inReview: 0, revisionsRequested: 0, approved: 0, rejected: 0,
    cashRequested: 0, cashApproved: 0,
    phases: { preparing: 0, review: 0, approved: 0, closed: 0 },
  };
  for (const row of rows) {
    if (row.status === "draft") stats.draft += 1;
    else if (row.status === "revisions_requested") stats.revisionsRequested += 1;
    else if (row.status === "approved") stats.approved += 1;
    else if (row.status === "rejected") stats.rejected += 1;
    else if (IN_REVIEW_STATUSES.has(row.status)) stats.inReview += 1;
    stats.phases[contributorPhase(row.status)] += 1;
    const cash = Number.isFinite(row.cashTotal) ? row.cashTotal : 0;
    if (row.status !== "rejected") stats.cashRequested += cash;
    if (row.status === "approved") stats.cashApproved += cash;
  }
  return stats;
}

const ACTION_LABEL: Record<string, string> = {
  submit: "Submitted for review",
  pass_pre_screening: "Pre-screening completed",
  confirm_evidence: "Evidence confirmed",
  request_revision: "Revisions requested",
  finance_clear: "Finance cleared",
  finance_return: "Returned by Finance",
  director_approve: "Approved",
  director_reject: "Rejected",
  approved: "Approved",
};

const WARNING_LABEL: Record<string, string> = {
  manual_beneficiary_source: "The beneficiary count comes from my own documented source, not approved profiling data.",
  beneficiary_override: "The beneficiary count differs from the approved profiling estimate, and I explained why.",
  stale_profiling_evidence: "The profiling evidence behind the count is older than the latest completed cycle.",
  need_status_changed: "The linked community need changed status after I selected it.",
  partner_relationship_not_active: "My organization has no active partnership agreement with PARAYA on record.",
};

/** A sentence the proponent confirms before submitting; unknown codes fall back to readable words. */
export function warningLabel(code: string): string {
  return WARNING_LABEL[code] ?? code.replaceAll("_", " ");
}

/** Plain-language label for a workflow event, falling back to its new status. */
export function workflowEventLabel(action: string, toStatus: string | null): string {
  return ACTION_LABEL[action] ?? (toStatus ? statusLabel(toStatus) : action.replaceAll("_", " "));
}
