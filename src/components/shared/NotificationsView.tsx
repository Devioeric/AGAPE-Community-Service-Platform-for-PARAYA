"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BellOff, Check, CheckCheck, Loader2, AlertCircle,
  Info, CheckCircle2, AlertTriangle, Megaphone, Trophy, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Notification {
  id:         string;
  type:       string;
  title:      string;
  message:    string;
  action_url: string | null;
  is_read:    boolean;
  created_at: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  info:         { label: "Info",         color: "#5B7FA5", icon: Info        },
  warning:      { label: "Warning",      color: "#B8860B", icon: AlertTriangle },
  success:      { label: "Success",      color: "#4A7C59", icon: CheckCircle2 },
  danger:       { label: "Important",    color: "#9B3B3B", icon: AlertCircle },
  approval:     { label: "Approval",     color: "#5B7FA5", icon: CheckCircle2 },
  reminder:     { label: "Reminder",     color: "#B8860B", icon: AlertTriangle },
  announcement: { label: "Announcement", color: "#6B5B3E", icon: Megaphone   },
  recognition:  { label: "Recognition",  color: "#4A7C59", icon: Trophy      },
};

const FILTERS = [
  { value: "all",    label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read",   label: "Read" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const d        = new Date(iso);
  const diffMs   = Date.now() - d.getTime();
  const diffMin  = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay  = Math.floor(diffHour / 24);
  if (diffMin < 1)    return "Just now";
  if (diffMin < 60)   return `${diffMin}m ago`;
  if (diffHour < 24)  return `${diffHour}h ago`;
  if (diffDay  < 7)   return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NotificationsView() {
  const [notifs, setNotifs]   = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<"all" | "unread" | "read">("all");
  const [busy, setBusy]       = useState(false);
  const [page, setPage] = useState(1);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const inboxRequest = useRef<AbortController | null>(null);
  const pageSize = 25;

  const fetchNotifs = useCallback(async () => {
    inboxRequest.current?.abort();
    const controller = new AbortController(); inboxRequest.current = controller;
    setLoading(true); setLoadError(false);
    try {
      const res = await fetch(`/api/notifications?page=${page}&page_size=${pageSize}&filter=${filter}`, { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("Inbox unavailable");
      const j = await res.json();
      if (controller.signal.aborted) return;
      setNotifs(j.data ?? []);
      setUnreadCount(j.unreadCount); setTotal(j.total); setHasMore(j.hasMore);
    } catch { if (!controller.signal.aborted) { setLoadError(true); setUnreadCount(null); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [filter, page]);

  useEffect(() => {
    void fetchNotifs();
    window.addEventListener("agape:notifications-updated", fetchNotifs);
    return () => { inboxRequest.current?.abort(); window.removeEventListener("agape:notifications-updated", fetchNotifs); };
  }, [fetchNotifs]);

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
    const res = await fetch("/api/notifications", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ids }),
    });
    if (res.ok) {
      // Reload server truth; marking unread-filter rows may change page boundaries.
      setPage(1);
      window.dispatchEvent(new Event("agape:notifications-updated"));
    } else {
      toast.error("Failed to update.");
    }
    } catch { toast.error("Notifications could not be updated. Please retry."); }
    finally { setBusy(false); }
  }

  function markDisplayedRead() {
    const unreadIds = notifs.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    markRead(unreadIds);
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {unreadCount !== null && unreadCount > 0 && (
              <Badge className="bg-primary text-primary-foreground border-0 text-xs ml-1">
                {unreadCount} unread
              </Badge>
            )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(1); }}
            aria-label="Filter notifications" disabled={busy}
            className="h-9 px-3 text-sm"
          >
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <Button
            onClick={markDisplayedRead}
            disabled={busy || loading || loadError || !notifs.some(notification => !notification.is_read)}
            size="sm"
            variant="outline"
            className="gap-1.5"
          >
            <CheckCheck className="w-4 h-4" /> Mark displayed read
          </Button>
        </div>
      </div>

      {/* List */}
      <Card className="border-border shadow-card">
        <CardContent className="p-0">
          {loadError ? <div role="alert" className="p-6 text-sm text-warning">Notifications could not be loaded. <Button variant="outline" size="sm" onClick={fetchNotifs}>Retry</Button></div> : loading ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading notifications…
            </div>
          ) : notifs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <BellOff className="w-10 h-10 mx-auto opacity-30" />
              <p className="text-sm">
                {filter === "unread" ? "No unread notifications." : filter === "read" ? "No read notifications." : "No notifications yet."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifs.map((n) => {
                const meta = TYPE_META[n.type] ?? TYPE_META.info;
                const Icon = meta.icon;
                return (
                  <li
                    key={n.id}
                    className={`flex items-start gap-3 p-4 transition-colors hover:bg-surface-alt/40 ${
                      !n.is_read ? "bg-primary/5" : ""
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: `${meta.color}15`, color: meta.color }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="font-medium text-sm text-foreground">{n.title}</p>
                        <Badge
                          className="text-[11px] capitalize"
                          style={{
                            background: `${meta.color}18`,
                            color:      meta.color,
                            border:    `1px solid ${meta.color}30`,
                          }}
                        >
                          {meta.label}
                        </Badge>
                        {!n.is_read && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">{relativeTime(n.created_at)}</span>
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed">{n.message}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {n.action_url && (
                          <Link
                            href={n.action_url}
                            className="text-xs text-primary hover:text-primary-dark inline-flex items-center gap-1 transition-colors"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                        {!n.is_read && (
                          <button
                            onClick={() => markRead([n.id])}
                            disabled={busy}
                            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                          >
                            <Check className="w-3 h-3" /> Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      {!loadError && <nav aria-label="Notification pages" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{total === 0 ? "0 notifications" : `Page ${page} of ${Math.max(1, Math.ceil(total / pageSize))} · ${total} ${filter === "all" ? "total" : filter} notifications`}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={loading || busy || page <= 1} onClick={() => setPage(current => current - 1)}>Newer</Button>
          <Button variant="outline" size="sm" disabled={loading || busy || !hasMore} onClick={() => setPage(current => current + 1)}>Older</Button>
        </div>
      </nav>}
    </div>
  );
}
