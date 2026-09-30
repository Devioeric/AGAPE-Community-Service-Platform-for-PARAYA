import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DashboardLayoutClient } from "@/components/layout/DashboardLayoutClient";
import { PageTransition } from "@/components/layout/PageTransition";
import { isContributorRoleEnabled, ROLE_SEGMENT } from "@/lib/auth/roles";
import { DashboardActorProvider } from "@/components/layout/DashboardActorContext";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already verified auth and fetched the user profile — read it
  // from request headers instead of re-running getUser() + the users query.
  const h        = await headers();
  const dbRole   = h.get("x-user-role");
  const email    = h.get("x-user-email");
  const fullName = h.get("x-user-name");
  const permsRaw = h.get("x-user-permissions");

  if (!dbRole || !email) {
    // Middleware didn't run or didn't set headers — bail out defensively.
    redirect("/login");
  }

  const segment = ROLE_SEGMENT[dbRole];
  if (!segment) redirect("/login?reason=role_unmapped");

  const userName  = fullName || email;
  const userEmail = email;

  let permissions: Record<string, boolean> = {};
  if (permsRaw) {
    try { permissions = JSON.parse(permsRaw); } catch { /* keep empty */ }
  }

  return (
    <DashboardActorProvider actor={{ role: dbRole, permissions }}>
    <DashboardShell
      role={segment}
      dbRole={dbRole}
      userName={userName}
      userEmail={userEmail}
      permissions={permissions}
      featureFlags={{ AGAPE_CONTRIBUTOR_ROLE_V1_ENABLED: isContributorRoleEnabled() }}
    >
            <DashboardLayoutClient role={segment}>
              <PageTransition>{children}</PageTransition>
            </DashboardLayoutClient>
    </DashboardShell>
    </DashboardActorProvider>
  );
}
