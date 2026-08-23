// Central source of truth for user roles.
// The approved login model has nine roles: 3 PARAYA staff, 3 barangay,
// volunteer, finance_officer, and admin. Former institutional account roles
// and legacy aliases remain in the type/routing maps temporarily so existing
// identities can be migrated without losing attribution. They must not be
// assignable to new users or receive new operational write authority.

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
  | "admin"
  // Legacy — kept as aliases during the transition
  | "paraya_officer"
  | "barangay_official";

// ─── Role groups ────────────────────────────────────────────────────────────

export const PARAYA_ROLES = [
  "paraya_director",
  "paraya_associate",
  "paraya_researcher",
  "paraya_officer", // legacy alias
] as const;

export const BARANGAY_ROLES = [
  "barangay_captain",
  "barangay_secretary",
  "barangay_mother_leader",
  "barangay_official", // legacy alias
] as const;

/** Former institutional roles retained only for migration/read compatibility. */
export const PARTNER_ROLES = ["office", "student_org", "department"] as const;

/** Roles that can assign volunteers to programs / manage core ops. */
export const STAFF_ROLES = [...PARAYA_ROLES] as const;

/** Finance clearance is an independent Finance Officer action. */
export const FINANCE_CLEARING_ROLES = ["finance_officer"] as const;

export function canClearFinance(role: string | null | undefined): boolean {
  return !!role && (FINANCE_CLEARING_ROLES as readonly string[]).includes(role);
}

/** Roles that can moderate / take privileged write actions across the system. */
export const MODERATOR_ROLES = ["paraya_director", "paraya_associate", "paraya_officer"] as const;

/** Only PARAYA officers encode and submit proposals. */
export const PROPOSAL_SUBMITTER_ROLES = [...PARAYA_ROLES] as const;

// ─── Group predicates ──────────────────────────────────────────────────────

export function isParayaStaff(role: string | null | undefined): boolean {
  return !!role && (PARAYA_ROLES as readonly string[]).includes(role);
}

export function isBarangayRole(role: string | null | undefined): boolean {
  return !!role && (BARANGAY_ROLES as readonly string[]).includes(role);
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

/** Final proposal approval or rejection belongs to the Director alone. */
export function canMakeFinalProposalDecision(role: string | null | undefined): boolean {
  return role === "paraya_director";
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
  paraya_director:        "PARAYA Director",
  paraya_associate:       "PARAYA Associate",
  paraya_researcher:      "PARAYA Researcher",
  volunteer:              "Student Volunteer",
  barangay_captain:       "Barangay Captain",
  barangay_secretary:     "Barangay Secretary",
  barangay_mother_leader: "Mother Leader",
  finance_officer:        "Finance Officer",
  office:                 "Office",
  student_org:            "Student Organization",
  department:             "Department",
  admin:                  "System Administrator",
  // Legacy
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
  paraya_director:        "/officer",
  paraya_associate:       "/officer",
  paraya_researcher:      "/officer",
  volunteer:              "/volunteer",
  barangay_captain:       "/barangay",
  barangay_secretary:     "/barangay",
  barangay_mother_leader: "/barangay",
  // Finance Officer drops onto the officer dashboard for now — they need to
  // see proposals waiting for clearance. RBAC filters which actions they can
  // take inside it.
  finance_officer:        "/officer",
  // Partner accounts share one dashboard segment. Per-role labelling lives
  // inside the UI (header chip, dashboard header).
  office:                 "/partner",
  student_org:            "/partner",
  department:             "/partner",
  admin:                  "/admin",
  // Legacy aliases
  paraya_officer:         "/officer",
  barangay_official:      "/barangay",
};

/** Allowed top-level route prefix for the role (used by middleware). */
export const ROLE_PREFIX: Record<string, string> = ROLE_HOME;

/** The path segment used for the role's section (officer / volunteer / barangay / partner / admin). */
export const ROLE_SEGMENT: Record<string, string> = {
  paraya_director:        "officer",
  paraya_associate:       "officer",
  paraya_researcher:      "officer",
  volunteer:              "volunteer",
  barangay_captain:       "barangay",
  barangay_secretary:     "barangay",
  barangay_mother_leader: "barangay",
  finance_officer:        "officer",
  office:                 "partner",
  student_org:            "partner",
  department:             "partner",
  admin:                  "admin",
  // Legacy aliases
  paraya_officer:         "officer",
  barangay_official:      "barangay",
};

/** Approved login roles assignable via Admin > Invite User (admin excluded). */
export const ASSIGNABLE_ROLES: { value: Role; label: string; group: "paraya" | "barangay" | "volunteer" | "finance" | "partner" }[] = [
  { value: "paraya_director",        label: "PARAYA Director",      group: "paraya"    },
  { value: "paraya_associate",       label: "PARAYA Associate",     group: "paraya"    },
  { value: "paraya_researcher",      label: "PARAYA Researcher",    group: "paraya"    },
  { value: "finance_officer",        label: "Finance Officer",      group: "finance"   },
  { value: "barangay_captain",       label: "Barangay Captain",     group: "barangay"  },
  { value: "barangay_secretary",     label: "Barangay Secretary",   group: "barangay"  },
  { value: "barangay_mother_leader", label: "Mother Leader",        group: "barangay"  },
  { value: "volunteer",              label: "Student Volunteer",    group: "volunteer" },
];
