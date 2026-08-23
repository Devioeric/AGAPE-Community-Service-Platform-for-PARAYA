export const PROPOSAL_ACTIONS = [
  "advance",
  "reject",
  "mark_finance_cleared",
  "request_revisions",
  "resubmit",
] as const;

export type ProposalAction = (typeof PROPOSAL_ACTIONS)[number];

export interface ProposalActionInput {
  action: ProposalAction;
  notes: string | null;
  finance_notes: string | null;
}

export interface ProposalActionContext extends ProposalActionInput {
  role: string | null | undefined;
  currentStatus: string;
  financeClearance: boolean;
}

export interface ProposalActionDecision {
  allowed: boolean;
  httpStatus?: 400 | 403 | 422;
  error?: string;
}

export type ProposalActionContractResult =
  | { ok: true; data: ProposalActionInput }
  | { ok: false; error: string };

type NoteContractResult =
  | { ok: true; data: string | null }
  | { ok: false; error: string };

export const PROPOSAL_PIPELINE: Readonly<Record<string, string>> = {
  submitted: "pre_screening",
  pre_screening: "sdg_review",
  sdg_review: "finance_review",
  // The existing schema has no director_review state yet. During Phase 0,
  // finance_review is retained as the pre-decision state and only the Director
  // may perform its final transition.
  finance_review: "approved",
};

const ACTION_SET = new Set<string>(PROPOSAL_ACTIONS);
const BODY_FIELDS = new Set(["action", "notes", "finance_notes"]);
const REVIEW_STAGES = new Set(["submitted", "pre_screening", "sdg_review", "finance_review"]);
const PARAYA_REVIEW_ROLES = new Set([
  "paraya_director",
  "paraya_associate",
  "paraya_researcher",
  "paraya_officer", // temporary legacy alias; never receives final authority
]);

function canReview(role: string | null | undefined): boolean {
  return !!role && PARAYA_REVIEW_ROLES.has(role);
}

export const PROPOSAL_REVISION_RETURN_STAGES = [
  "submitted",
  "pre_screening",
  "sdg_review",
  "finance_review",
] as const;

export function normalizeProposalRevisionReturnStatus(value: unknown): string {
  return typeof value === "string" && REVIEW_STAGES.has(value) ? value : "submitted";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNote(value: unknown, field: string): NoteContractResult {
  if (value === undefined || value === null || value === "") return { ok: true, data: null };
  if (typeof value !== "string") return { ok: false, error: `${field} must be a string or null.` };
  const normalized = value.trim();
  if (normalized.length > 10_000) {
    return { ok: false, error: `${field} must be at most 10000 characters.` };
  }
  return { ok: true, data: normalized || null };
}

export function parseProposalActionInput(input: unknown): ProposalActionContractResult {
  if (!isRecord(input)) return { ok: false, error: "Request body must be a JSON object." };
  const unknown = Object.keys(input).filter((field) => !BODY_FIELDS.has(field));
  if (unknown.length > 0) {
    return { ok: false, error: `Unexpected action field(s): ${unknown.join(", ")}.` };
  }
  if (typeof input.action !== "string" || !ACTION_SET.has(input.action)) {
    return { ok: false, error: `action must be one of: ${PROPOSAL_ACTIONS.join(", ")}.` };
  }
  const notes = optionalNote(input.notes, "notes");
  if (!notes.ok) return notes;
  const financeNotes = optionalNote(input.finance_notes, "finance_notes");
  if (!financeNotes.ok) return financeNotes;
  return {
    ok: true,
    data: {
      action: input.action as ProposalAction,
      notes: notes.data,
      finance_notes: financeNotes.data,
    },
  };
}

function deny(httpStatus: 400 | 403 | 422, error: string): ProposalActionDecision {
  return { allowed: false, httpStatus, error };
}

export function authorizeProposalAction(context: ProposalActionContext): ProposalActionDecision {
  const { action, role, currentStatus, financeClearance, notes } = context;

  if (action === "mark_finance_cleared") {
    if (role !== "finance_officer") return deny(403, "Only the Finance Officer can clear a proposal budget.");
    if (currentStatus !== "finance_review") {
      return deny(400, "Finance clearance can only be recorded during finance review.");
    }
    if (financeClearance) return deny(400, "The proposal budget is already finance-cleared.");
    return { allowed: true };
  }

  if (action === "request_revisions") {
    if (!REVIEW_STAGES.has(currentStatus)) {
      return deny(400, "Revisions can only be requested while the proposal is under review.");
    }
    if (!notes || notes.length < 5) {
      return deny(400, "Revision notes of at least 5 characters are required.");
    }
    if (currentStatus === "finance_review") {
      return role === "finance_officer"
        ? { allowed: true }
        : deny(403, "Only the Finance Officer can return a proposal from finance review.");
    }
    return canReview(role)
      ? { allowed: true }
      : deny(403, "Only PARAYA officers can request revisions at this review stage.");
  }

  if (action === "resubmit") {
    if (!canReview(role)) return deny(403, "Only PARAYA officers can resubmit a revised proposal.");
    if (currentStatus !== "revisions_requested") {
      return deny(400, "Only a proposal with requested revisions can be resubmitted.");
    }
    return { allowed: true };
  }

  if (action === "reject") {
    if (role !== "paraya_director") {
      return deny(403, "Only the PARAYA Director can reject a proposal.");
    }
    if (currentStatus !== "finance_review" || !financeClearance) {
      return deny(422, "Final rejection is available only after finance clearance at Director review.");
    }
    if (!notes || notes.length < 5) {
      return deny(400, "Rejection remarks of at least 5 characters are required.");
    }
    return { allowed: true };
  }

  if (action === "advance") {
    if (currentStatus === "finance_review") {
      if (role !== "paraya_director") {
        return deny(403, "Only the PARAYA Director can make the final proposal decision.");
      }
      if (!financeClearance) return deny(422, "Finance clearance is required before final approval.");
      return { allowed: true };
    }
    if (!canReview(role)) {
      return deny(403, "Only PARAYA officers can advance a proposal review.");
    }
    if (currentStatus !== "draft" && !PROPOSAL_PIPELINE[currentStatus]) {
      return deny(400, "The proposal cannot advance from its current status.");
    }
    return { allowed: true };
  }

  return deny(400, "Unsupported proposal action.");
}
