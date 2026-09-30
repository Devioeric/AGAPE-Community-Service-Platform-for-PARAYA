// Central source of truth for user roles.
// The approved login model has six active roles: one PARAYA Officer, one Contributor,
// one barangay Secretary role, volunteer, finance_officer, and admin. Retired and historical
// values remain in the type/display maps so historical attribution is never
// lost, but they are not assignable, routable, or operational.

export type Role =
  | "paraya_director"
  | "paraya_associate"
  | "paraya_researcher"
  | "volunteer"
  | "barangay_captain"
  | "barangay_secretary"
  | "barangay_mother_leader"
  | "finance_officer"
  | "office"
  | "student_org"
  | "department"
  | "contributor"
  | "admin"
  // Legacy — kept as aliases during the transition
  | "paraya_officer"
  | "barangay_official";

// ─── Role groups ────────────────────────────────────────────────────────────

export const PARAYA_ROLES = [
  "paraya_officer",
] as const;

export const ACTIVE_LOGIN_ROLES = [
  "paraya_officer",
  "contributor",
  "finance_officer",
  "barangay_secretary",
  "volunteer",
  "admin",
] as const;

export type ActiveLoginRole = (typeof ACTIVE_LOGIN_ROLES)[number];

/** Server-side rollout gate for the consolidated Contributor portal. */
export const CONTRIBUTOR_ROLE_FEATURE_FLAG = "AGAPE_CONTRIBUTOR_ROLE_V1_ENABLED";

export function isContributorRoleEnabled(): boolean {
  return process.env.AGAPE_CONTRIBUTOR_ROLE_V1_ENABLED === "true";
}

export function isRoleEnabled(role: string | null | undefined): boolean {
  return role !== "contributor" || isContributorRoleEnabled();
}

export function isActiveLoginRole(role: string | null | undefined): role is ActiveLoginRole {
  return !!role && (ACTIVE_LOGIN_ROLES as readonly string[]).includes(role);
}

export const BARANGAY_ROLES = [
  "barangay_secretary",
] as const;

export const ACTIVE_BARANGAY_ROLES = BARANGAY_ROLES;

/** Retained only for historical attribution and deterministic access denial. */
export const RETIRED_BARANGAY_ROLES = [
  "barangay_captain",
  "barangay_mother_leader",
  "barangay_official",
] as const;

/** Former institutional roles retained only for migration/read compatibility. */
export const PARTNER_ROLES = ["office", "student_org", "department"] as const;

/** Non-login identities; names and UUID references remain readable by staff. */
export const HISTORICAL_LOGIN_ROLES = [...PARTNER_ROLES, "paraya_director", "paraya_associate", "paraya_researcher"] as const;

/** Roles that can assign volunteers to programs / manage core ops. */
export const STAFF_ROLES = [...PARAYA_ROLES] as const;

/** Finance clearance is an independent Finance Officer action. */
export const FINANCE_CLEARING_ROLES = ["finance_officer"] as const;

export function canClearFinance(role: string | null | undefined): boolean {
  return !!role && (FINANCE_CLEARING_ROLES as readonly string[]).includes(role);
}

/** Roles that can moderate / take privileged write actions across the system. */
export const MODERATOR_ROLES = ["paraya_officer"] as const;

/** Only PARAYA officers encode and submit proposals. */
export const PROPOSAL_SUBMITTER_ROLES = [...PARAYA_ROLES] as const;

// ─── Group predicates ──────────────────────────────────────────────────────

export function isParayaStaff(role: string | null | undefined): boolean {
  return !!role && (PARAYA_ROLES as readonly string[]).includes(role);
}

export function isBarangayRole(role: string | null | undefined): boolean {
  return !!role && (BARANGAY_ROLES as readonly string[]).includes(role);
}

export function isRetiredBarangayRole(role: string | null | undefined): boolean {
  return !!role && (RETIRED_BARANGAY_ROLES as readonly string[]).includes(role);
}

export function isPartner(role: string | null | undefined): boolean {
  return !!role && (PARTNER_ROLES as readonly string[]).includes(role);
}

/** PARAYA staff OR admin — the typical "officer-level" write permission. */
export function isStaffOrAdmin(role: string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

/** Moderators for cross-cutting actions (forum mod, audit log read, etc.). */
export function isModerator(role: string | null | undefined): boolean {
  return !!role && (MODERATOR_ROLES as readonly string[]).includes(role);
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canSubmitProposal(role: string | null | undefined): boolean {
  return !!role && (PROPOSAL_SUBMITTER_ROLES as readonly string[]).includes(role);
}

/** Proposal content editing follows the same operational boundary as create. */
export function canEditProposal(role: string | null | undefined): boolean {
  return canSubmitProposal(role);
}

/** PARAYA officers may perform non-final human review workflow actions. */
export function canReviewProposal(role: string | null | undefined): boolean {
  return canSubmitProposal(role);
}

/** Final proposal approval or rejection belongs to the consolidated Officer. */
export function canMakeFinalProposalDecision(role: string | null | undefined): boolean {
  return role === "paraya_officer";
}

/** Finance may return a budget for revision, but never reject the project. */
export function canReturnFinanceForRevision(role: string | null | undefined): boolean {
  return role === "finance_officer";
}

/** Operational program records are managed by PARAYA officers, not by the
 * infrastructure administrator, Finance, or former institutional logins. */
export function canManageProgram(role: string | null | undefined): boolean {
  return canSubmitProposal(role);
}

// ─── Display ────────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<string, string> = {
  paraya_director:        "PARAYA Director (historical)",
  paraya_associate:       "PARAYA Associate (historical)",
  paraya_researcher:      "PARAYA Researcher (historical)",
  volunteer:              "Student Volunteer",
  barangay_captain:       "Barangay Captain",
  barangay_secretary:     "Barangay Secretary",
  barangay_mother_leader: "Mother Leader",
  finance_officer:        "Finance Officer",
  office:                 "Office",
  student_org:            "Student Organization",
  department:             "Department",
  contributor:            "Contributor",
  admin:                  "System Administrator",
  paraya_officer:         "PARAYA Officer",
  barangay_official:      "Barangay Official",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "User";
  return ROLE_LABELS[role] ?? role;
}

// ─── Route mapping ──────────────────────────────────────────────────────────

/** Where a role's dashboard home lives. */
export const ROLE_HOME: Record<string, string> = {
  paraya_officer:         "/officer",
  contributor:            "/contributor",
  volunteer:              "/volunteer",
  barangay_secretary:     "/barangay",
  // Finance Officer drops onto the officer dashboard for now — they need to
  // see proposals waiting for clearance. RBAC filters which actions they can
  // take inside it.
  finance_officer:        "/officer",
  admin:                  "/admin",
};

/** Allowed top-level route prefix for the role (used by middleware). */
export const ROLE_PREFIX: Record<string, string> = ROLE_HOME;

/** The path segment used for the role's section (officer / volunteer / barangay / partner / admin). */
export const ROLE_SEGMENT: Record<string, string> = {
  paraya_officer:         "officer",
  contributor:            "contributor",
  volunteer:              "volunteer",
  barangay_secretary:     "barangay",
  finance_officer:        "officer",
  admin:                  "admin",
};

/** Approved login roles assignable via Admin > Invite User (admin excluded). */
export const ASSIGNABLE_ROLES: { value: Role; label: string; group: "paraya" | "barangay" | "volunteer" | "finance" | "partner" }[] = [
  { value: "paraya_officer",         label: "PARAYA Officer",       group: "paraya"    },
  { value: "finance_officer",        label: "Finance Officer",      group: "finance"   },
  { value: "barangay_secretary",     label: "Barangay Secretary",   group: "barangay"  },
  { value: "volunteer",              label: "Student Volunteer",    group: "volunteer" },
  { value: "contributor",            label: "Contributor",           group: "partner"   },
];
