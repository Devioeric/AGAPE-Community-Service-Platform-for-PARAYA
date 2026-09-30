"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { NavigationFeatureFlags } from "@/lib/navigation/catalog";

export function DashboardShell({ children, role, dbRole, userName, userEmail, permissions, featureFlags }: {
  children: React.ReactNode; role: string; dbRole: string; userName: string; userEmail: string; permissions: Record<string, boolean>; featureFlags?: NavigationFeatureFlags;
}) {
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem("agape.sidebar.collapsed.v1") === "true");
    } catch {
      // Keep the expanded default when browser storage is unavailable.
    } finally {
      setSidebarReady(true);
    }
  }, []);
  useEffect(() => {
    if (!sidebarReady) return;
    try {
      window.localStorage.setItem("agape.sidebar.collapsed.v1", String(sidebarCollapsed));
    } catch {
      // Persistence is an enhancement; in-memory toggling still works.
    }
  }, [sidebarCollapsed, sidebarReady]);
  const props = { role, dbRole, userName, userEmail, permissions, featureFlags };
  const sidebarStyle = { "--agape-sidebar-width": sidebarCollapsed ? "72px" : "280px" } as React.CSSProperties;
  return <div
    className="agape-shell min-h-screen min-w-0 bg-background"
    data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
    data-sidebar-ready={sidebarReady ? "true" : "false"}
    style={sidebarStyle}
  >
    <div className="hidden lg:block"><Sidebar {...props} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} /></div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger aria-label="Open navigation" className="fixed left-3 top-3 z-50 rounded-md p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary lg:hidden"><Menu className="h-5 w-5" /></DialogTrigger>
      <DialogContent className="left-0 top-0 h-dvh w-[280px] max-w-[90vw] translate-x-0 translate-y-0 gap-0 rounded-none p-0 sm:max-w-[280px]">
        <DialogTitle className="sr-only">Main navigation</DialogTitle>
        <Sidebar {...props} embedded collapsed={false} />
      </DialogContent>
    </Dialog>
    <div className="agape-dashboard-content min-w-0 lg:ml-[var(--agape-sidebar-width)]">
      <Header userName={userName} userEmail={userEmail} role={role} dbRole={dbRole} permissions={permissions} />
      <main className="min-h-screen min-w-0 pt-16"><div className="min-w-0 p-4 sm:p-6">{children}</div></main>
    </div>
  </div>;
}
