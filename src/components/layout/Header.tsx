"use client";

import { Bell, CheckCheck, Info, AlertCircle, CheckCircle2, Clock, House } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { getHeaderBreadcrumbs } from "@/lib/navigation/breadcrumbs";
import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface HeaderProps {
  userName: string;
  userEmail: string;
  role: string;
  dbRole: string;
  permissions: Record<string, boolean>;
  notificationCount?: number;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NotifIcon({ type }: { type: string }) {
  const cls = "w-4 h-4 shrink-0 mt-0.5";
  if (type === "success") return <CheckCircle2 className={`${cls} text-success`} />;
  if (type === "warning") return <AlertCircle className={`${cls} text-warning`} />;
  if (type === "error")   return <AlertCircle className={`${cls} text-danger`} />;
  return <Info className={`${cls} text-info`} />;
}

export function Header({
  userName,
  userEmail,
  role,
  dbRole,
  permissions,
}: HeaderProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const breadcrumbs = getHeaderBreadcrumbs({ pathname, dbRole, permissions });
  const pageTitle = breadcrumbs[breadcrumbs.length - 1]?.label ?? "AGAPE";

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState<number | null>(null);
  const [notifError, setNotifError] = useState(false);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifBusy, setNotifBusy] = useState(false);
  const notifRequest = useRef<AbortController | null>(null);

  const fetchNotifications = useCallback(async () => {
    notifRequest.current?.abort();
    const controller = new AbortController(); notifRequest.current = controller;
    setNotifLoading(true); setNotifError(false);
    try {
      const res = await fetch("/api/notifications?page=1&page_size=8", { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("Inbox unavailable");
      const json = await res.json();
      if (controller.signal.aborted) return;
      setNotifications(json.data ?? []);
      setUnread(json.unreadCount);
    } catch {
      if (!controller.signal.aborted) { setNotifError(true); setUnread(null); }
    } finally { if (!controller.signal.aborted) setNotifLoading(false); }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    window.addEventListener("agape:notifications-updated", fetchNotifications);
    return () => { clearInterval(interval); notifRequest.current?.abort(); window.removeEventListener("agape:notifications-updated", fetchNotifications); };
  }, [fetchNotifications]);

  async function markDisplayedRead() {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    setNotifBusy(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
      if (!response.ok) throw new Error("Unable to mark displayed notifications read");
      window.dispatchEvent(new Event("agape:notifications-updated"));
    } catch { toast.error("Unable to mark displayed notifications read. Please retry."); }
    finally { setNotifBusy(false); }
  }

  async function markOneRead(id: string) {
    setNotifBusy(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!response.ok) throw new Error("Unable to mark notification read");
      window.dispatchEvent(new Event("agape:notifications-updated"));
    } catch { toast.error("Unable to mark notification read. Please retry."); }
    finally { setNotifBusy(false); }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const recent = notifications.slice(0, 8);

  return (
    <header className="agape-dashboard-header fixed top-0 right-0 left-0 lg:left-[var(--agape-sidebar-width)] z-40 h-16 bg-surface border-b border-border flex items-center justify-between gap-2 pl-14 pr-3 lg:px-6 shadow-[0_1px_4px_rgba(107,91,62,0.06)]">
      <h1 className="sr-only">{pageTitle}</h1>
      <Breadcrumb aria-label="Breadcrumb" className="agape-breadcrumb min-w-0 flex-1 overflow-hidden font-sans">
        <BreadcrumbList className="flex w-full min-w-0 flex-nowrap gap-1 whitespace-nowrap text-xs text-muted-foreground sm:gap-1.5 sm:text-sm">
          {breadcrumbs.map((crumb, index) => {
            const isMiddle = index > 0 && index < breadcrumbs.length - 1;
            const isLast = index === breadcrumbs.length - 1;
            return (
              <Fragment key={crumb.id}>
                {isLast && breadcrumbs.length > 2 && (
                  <>
                    <BreadcrumbSeparator className="shrink-0 text-muted-foreground/70 sm:hidden" />
                    <BreadcrumbItem className="shrink-0 sm:hidden">
                      <BreadcrumbEllipsis className="text-muted-foreground" />
                    </BreadcrumbItem>
                  </>
                )}
                {index > 0 && <BreadcrumbSeparator className={`${isMiddle ? "hidden sm:inline-flex" : ""} shrink-0 text-muted-foreground/70`} />}
                <BreadcrumbItem className={isMiddle ? "hidden min-w-0 sm:inline-flex" : isLast ? "min-w-0 flex-1" : "min-w-0 shrink-0"}>
                  {crumb.href ? (
                    <BreadcrumbLink
                      render={<Link href={crumb.href} />}
                      className="inline-flex max-w-[9rem] min-w-0 items-center gap-1 truncate rounded-sm text-muted-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary sm:max-w-[14rem]"
                    >
                      {index === 0 && <House aria-hidden="true" className="size-3.5 shrink-0 text-primary sm:size-4" />}
                      <span className="truncate">{crumb.label}</span>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="inline-flex min-w-0 items-center gap-1 truncate font-heading text-sm font-semibold text-foreground">
                      {index === 0 && <House aria-hidden="true" className="size-3.5 shrink-0 text-primary sm:size-4" />}
                      <span className="truncate">{crumb.label}</span>
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Per-page action slot — pages inject buttons here via portal */}
      <div id="header-actions-slot" className="mr-1 flex shrink-0 items-center" />

      <div className="flex shrink-0 items-center gap-3">
        {/* Notifications dropdown */}
        <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
          <DropdownMenuTrigger aria-label={unread === null ? "Notifications" : `Notifications, ${unread} unread`} className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-primary/5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Bell className="w-5 h-5 text-foreground/70" />
            {unread !== null && unread > 0 && (
              <Badge className="absolute -top-1 -right-1 w-4 h-4 p-0 flex items-center justify-center text-[10px] bg-accent text-accent-foreground border-0">
                {unread > 9 ? "9+" : unread}
              </Badge>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80 p-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm text-foreground">Notifications{unread !== null ? ` · ${unread} unread` : ""}</span>
              {!notifError && notifications.some(notification => !notification.is_read) && (
                <button
                  onClick={markDisplayedRead}
                  disabled={notifBusy || notifLoading}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark displayed read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto">
              {notifError ? <div role="alert" className="p-4 text-sm text-warning">Notifications could not be loaded. <button onClick={fetchNotifications} className="underline">Retry</button></div> : notifLoading ? <p role="status" className="p-4 text-sm text-muted-foreground">Loading notifications…</p> : recent.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Clock className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                recent.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markOneRead(n.id)}
                    disabled={notifBusy || n.is_read}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-border/50 hover:bg-surface-alt transition-colors ${
                      !n.is_read ? "bg-accent-light/30" : ""
                    }`}
                  >
                    <NotifIcon type={n.type} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug truncate ${!n.is_read ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                        {n.message}
                      </p>
                      <p className="text-[11px] text-muted mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            {(
              <div className="border-t border-border px-4 py-2.5">
                <Link
                  href={`/${role}/notifications`}
                  className="text-xs text-primary hover:text-primary-dark font-medium transition-colors"
                  onClick={() => setNotifOpen(false)}
                >
                  View all notifications
                </Link>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 h-9 px-2 rounded-lg hover:bg-primary/5 transition-colors">
            <Avatar className="w-7 h-7">
              <AvatarFallback className="text-xs bg-primary/20 text-primary font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-foreground hidden sm:block max-w-[120px] truncate">
              {userName}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <p className="font-medium truncate">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Link href={`/${role}/profile`}>Profile Settings</Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="text-danger" onClick={handleLogout}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
