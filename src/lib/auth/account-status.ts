/**
 * Effectively indefinite for the capstone while still using Supabase Auth's
 * documented duration format. Administrators lift the ban with `none` when an
 * account becomes active.
 */
export const INACTIVE_AUTH_BAN_DURATION = "876000h";

export type ApplicationAccountState = {
  status?: string | null;
  is_active?: boolean | null;
  role?: string | null;
};

export function isActiveAccount(
  account: ApplicationAccountState | null | undefined
): boolean {
  return account?.status === "active"
    && account.is_active === true
    // Kept dependency-free for the Auth boundary and native Node contract gates.
    // The focused contract test requires exact parity with ACTIVE_LOGIN_ROLES.
    && ["paraya_officer", "contributor", "finance_officer", "barangay_secretary", "volunteer", "admin"].includes(account.role ?? "");
}
