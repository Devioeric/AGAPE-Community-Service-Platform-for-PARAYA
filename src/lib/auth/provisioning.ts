/**
 * Login roles that a System Administrator may provision. Institutional units
 * are deliberately absent: the approved scope represents them as non-login
 * Partner/Proponent records. Legacy accounts remain usable but cannot be newly
 * created or assigned.
 */
export const ADMIN_ASSIGNABLE_LOGIN_ROLES = [
  "paraya_director",
  "paraya_associate",
  "paraya_researcher",
  "finance_officer",
  "barangay_captain",
  "barangay_secretary",
  "barangay_mother_leader",
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
