// PARAYA Action Research Cycle — phase mapping helper.
//
// The framework defines 8 sequential phases (I–VIII). Proposals live across
// the first six (objectives → endorsement); once approved they pass to
// programs/impact tables for Phases VII–VIII.
//
// This helper buckets a proposal's *current* state into a phase label so the
// Director's dashboard can show "we have N initiatives in Diagnostic, M in
// Filing, etc." without us adding a new column to the table.

export type ProposalLikeForPhase = {
  status:               string;
  community_validated?: boolean | null;
};

export type PhaseKey = "diagnostic" | "research" | "filing" | "execution" | "closed";

export interface PhaseInfo {
  key:    PhaseKey;
  range:  string;     // e.g. "I–II"
  label:  string;     // e.g. "Diagnostic & Objectives"
  desc:   string;
  color:  string;     // tailwind utility for bar fill
}

export const PHASE_META: Record<PhaseKey, PhaseInfo> = {
  diagnostic: {
    key:   "diagnostic",
    range: "I–II",
    label: "Diagnostic & Objectives",
    desc:  "Observing the community, drafting objectives, awaiting validation",
    color: "bg-muted-foreground",
  },
  research: {
    key:   "research",
    range: "III–V",
    label: "Research & Analysis",
    desc:  "Designing instruments, gathering data, synthesizing findings",
    color: "bg-info",
  },
  filing: {
    key:   "filing",
    range: "VI",
    label: "Filing & Endorsement",
    desc:  "Submitted for review, screening, SDG check, finance clearance",
    color: "bg-warning",
  },
  execution: {
    key:   "execution",
    range: "VII",
    label: "Execution",
    desc:  "Approved and operational — handed to program tracking",
    color: "bg-success",
  },
  closed: {
    key:   "closed",
    range: "—",
    label: "Closed",
    desc:  "Rejected — no longer in the active pipeline",
    color: "bg-danger",
  },
};

const REVIEW_STATES = new Set([
  "submitted", "pre_screening", "sdg_review", "finance_review", "revisions_requested",
]);

export function derivePhase(p: ProposalLikeForPhase): PhaseInfo {
  if (p.status === "rejected") return PHASE_META.closed;
  if (p.status === "approved") return PHASE_META.execution;
  if (REVIEW_STATES.has(p.status)) return PHASE_META.filing;

  // status === 'draft' — split by whether community validation has happened.
  // Pre-validation = Phase I–II (still shaping the question with stakeholders).
  // Post-validation = Phase III–V (research design / analysis is underway,
  // assuming the proponent is drafting before submission).
  if (p.status === "draft") {
    return p.community_validated ? PHASE_META.research : PHASE_META.diagnostic;
  }
  return PHASE_META.diagnostic;
}
