"use client";

import { useEffect, useState } from "react";
import { Clock, Activity, Calendar, Loader2, Bell, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  stats: {
    totalHours:         number;
    activitiesJoined:   number;
    activitiesThisMonth: number;
    upcomingEvents:     number;
  };
  announcements: {
    id:         string;
    type:       string;
    title:      string;
    message:    string;
    created_at: string;
  }[];
  recentLogs: {
    id:      string;
    date:    string;
    program: string;
    hours:   number;
    status:  string;
  }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, string> = {
  important:   "bg-danger/10 text-danger",
  warning:     "bg-warning/10 text-warning",
  reminder:    "bg-warning/10 text-warning",
  success:     "bg-success/10 text-success",
  recognition: "bg-success/10 text-success",
  info:        "bg-info/10 text-info",
  approval:    "bg-info/10 text-info",
};

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-success/10 text-success",
  pending:  "bg-warning/10 text-warning",
  rejected: "bg-danger/10 text-danger",
};

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function tagLabel(type: string) {
  if (!type) return "Info";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function VolunteerDashboard() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/volunteer/dashboard")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => setData(j.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading dashboard…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-32 text-center text-muted-foreground text-sm">
        Failed to load dashboard. Please refresh the page.
      </div>
    );
  }

  const { stats, announcements, recentLogs } = data;

  const statCards = [
    {
      label: "Total Hours",
      value: stats.totalHours.toLocaleString(),
      icon:  Clock,
      sub:   "This semester",
    },
    {
      label: "Activities Joined",
      value: stats.activitiesJoined,
      icon:  Activity,
      sub:   `${stats.activitiesThisMonth} this month`,
    },
    {
      label: "Upcoming Events",
      value: stats.upcomingEvents,
      icon:  Calendar,
      sub:   "Next 7 days",
    },
  ];

  return (
    <div className="space-y-6">

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="border-border shadow-card border-l-4 border-l-accent">
            <CardContent className="px-5 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-1 font-heading">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Announcements (from notifications) */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg">Announcements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                <Bell className="w-8 h-8 opacity-30" />
                <p className="text-sm">No announcements yet.</p>
              </div>
            ) : announcements.map((ann) => (
              <div key={ann.id} className="p-3 rounded-lg bg-surface-alt border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-foreground">{ann.title}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      TAG_COLORS[ann.type] ?? "bg-info/10 text-info"
                    }`}
                  >
                    {tagLabel(ann.type)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{fmtDate(ann.created_at)}</p>
                <p className="text-sm text-foreground/70">{ann.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity Log */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg">Recent Activity Log</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                <FileText className="w-8 h-8 opacity-30" />
                <p className="text-sm">No activity logged yet.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Date</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Program</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Hours</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((row, i) => (
                    <tr key={row.id} className={i % 2 === 0 ? "bg-surface-alt/40" : ""}>
                      <td className="py-2.5 text-muted-foreground">{fmtDate(row.date)}</td>
                      <td className="py-2.5 font-medium text-foreground">{row.program}</td>
                      <td className="py-2.5 text-foreground">{row.hours}h</td>
                      <td className="py-2.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                            STATUS_COLORS[row.status] ?? "bg-muted/30 text-muted-foreground"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
