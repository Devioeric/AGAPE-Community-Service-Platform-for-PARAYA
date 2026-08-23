"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, BellOff, Check, CheckCheck, Loader2, AlertCircle,
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

  const fetchNotifs = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const j = await res.json();
      setNotifs(j.data ?? []);
    } else {
      toast.error("Failed to load notifications.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  const filtered = useMemo(() => {
    if (filter === "unread") return notifs.filter((n) => !n.is_read);
    if (filter === "read")   return notifs.filter((n) =>  n.is_read);
    return notifs;
  }, [notifs, filter]);

  const unreadCount = useMemo(() => notifs.filter((n) => !n.is_read).length, [notifs]);

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    const res = await fetch("/api/notifications", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ids }),
    });
    if (res.ok) {
      setNotifs((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, is_read: true } : n));
    } else {
      toast.error("Failed to update.");
    }
    setBusy(false);
  }

  function markAllRead() {
    const unreadIds = notifs.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    markRead(unreadIds);
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" /> Notifications
            {unreadCount > 0 && (
              <Badge className="bg-primary text-primary-foreground border-0 text-xs ml-1">
                {unreadCount} unread
              </Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            In-app messages. Email + SMS delivery follows your notification preferences in Profile Settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="h-9 px-3 text-sm"
          >
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <Button
            onClick={markAllRead}
            disabled={busy || unreadCount === 0}
            size="sm"
            variant="outline"
            className="gap-1.5"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </Button>
        </div>
      </div>

      {/* List */}
      <Card className="border-border shadow-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading notifications…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <BellOff className="w-10 h-10 mx-auto opacity-30" />
              <p className="text-sm">
                {filter === "unread" ? "No unread notifications." : filter === "read" ? "No read notifications." : "No notifications yet."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((n) => {
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
                          className="text-[10px] capitalize"
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
    </div>
  );
}
