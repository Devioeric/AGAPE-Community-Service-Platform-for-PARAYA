"use client";

import { Bell, CheckCheck, Info, AlertCircle, CheckCircle2, Clock } from "lucide-react";
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
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { getPageTitle } from "@/lib/nav-titles";
import { useEffect, useState, useCallback } from "react";

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
}: HeaderProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const pageTitle = getPageTitle(pathname);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const unread = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const json = await res.json();
      setNotifications(json.data ?? []);
    } catch {
      // Non-critical — silently ignore fetch failures
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
    } catch { /* ignore */ }
  }

  async function markOneRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch { /* ignore */ }
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
    <header className="fixed top-0 right-0 left-[280px] z-40 h-16 bg-surface border-b border-border flex items-center justify-between px-6 shadow-[0_1px_4px_rgba(107,91,62,0.06)]">
      <h1 className="font-heading font-semibold text-xl text-foreground">
        {pageTitle}
      </h1>

      {/* Per-page action slot — pages inject buttons here via portal */}
      <div id="header-actions-slot" className="flex items-center mr-1" />

      <div className="flex items-center gap-3">
        {/* Notifications dropdown */}
        <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
          <DropdownMenuTrigger className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-primary/5 transition-colors outline-none">
            <Bell className="w-5 h-5 text-foreground/70" />
            {unread > 0 && (
              <Badge className="absolute -top-1 -right-1 w-4 h-4 p-0 flex items-center justify-center text-[9px] bg-accent text-accent-foreground border-0">
                {unread > 9 ? "9+" : unread}
              </Badge>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80 p-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm text-foreground">Notifications</span>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto">
              {recent.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Clock className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                recent.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markOneRead(n.id)}
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
                      <p className="text-[10px] text-muted mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
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
