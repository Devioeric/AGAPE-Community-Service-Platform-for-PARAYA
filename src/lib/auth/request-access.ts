export type ApiAccessClass =
  | "not_api"
  | "public"
  | "invite_completion"
  | "protected";

type ApplicationAccountState = {
  status?: string | null;
  is_active?: boolean | null;
};

/**
 * Application APIs are protected by default. Cron endpoints retain their own
 * shared-secret verification; public volunteer signup is intentionally open;
 * invite completion has a narrowly scoped pending-account exception.
 */
export function classifyApiAccess(pathname: string): ApiAccessClass {
  if (!pathname.startsWith("/api/")) return "not_api";
  if (pathname === "/api/auth/signup"
      || pathname === "/api/v2/program-invitations/resolve"
      || pathname.startsWith("/api/v2/finance-integrity/verify/")
      || pathname.startsWith("/api/cron/")) {
    return "public";
  }
  if (pathname === "/api/auth/accept-invite") {
    return "invite_completion";
  }
  return "protected";
}

export function isPendingInvitedAccount(
  invitedAt: unknown,
  account: ApplicationAccountState | null | undefined
): boolean {
  return (
    typeof invitedAt === "string" &&
    invitedAt.length > 0 &&
    account?.status === "pending" &&
    account.is_active === false
  );
}
