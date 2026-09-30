/**
 * Login roles that a System Administrator may provision. Institutional units
 * are deliberately absent: the approved scope represents them as non-login
 * Partner/Proponent records. Historical identities remain readable for
 * attribution, but cannot log in, be created, assigned, or reactivated.
 */
export const ADMIN_ASSIGNABLE_LOGIN_ROLES = [
  "paraya_officer",
  "contributor",
  "finance_officer",
  "barangay_secretary",
  "volunteer",
] as const;

export type AdminAssignableLoginRole =
  (typeof ADMIN_ASSIGNABLE_LOGIN_ROLES)[number];

export function isAdminAssignableLoginRole(
  role: unknown
): role is AdminAssignableLoginRole {
  return (
    typeof role === "string" &&
    (ADMIN_ASSIGNABLE_LOGIN_ROLES as readonly string[]).includes(role)
  );
}
