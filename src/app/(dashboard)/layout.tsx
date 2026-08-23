import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { DashboardLayoutClient } from "@/components/layout/DashboardLayoutClient";
import { PageTransition } from "@/components/layout/PageTransition";
import { ROLE_SEGMENT } from "@/lib/auth/roles";

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

  const segment = ROLE_SEGMENT[dbRole] ?? "volunteer";

  const userName  = fullName || email;
  const userEmail = email;

  let permissions: Record<string, boolean> = {};
  if (permsRaw) {
    try { permissions = JSON.parse(permsRaw); } catch { /* keep empty */ }
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        role={segment}
        dbRole={dbRole}
        userName={userName}
        userEmail={userEmail}
        permissions={permissions}
      />
      <div className="ml-[280px]">
        <Header
          userName={userName}
          userEmail={userEmail}
          role={segment}
        />
        <main className="pt-16 min-h-screen">
          <div className="p-6">
            <DashboardLayoutClient role={segment}>
              <PageTransition>{children}</PageTransition>
            </DashboardLayoutClient>
          </div>
        </main>
      </div>
    </div>
  );
}
