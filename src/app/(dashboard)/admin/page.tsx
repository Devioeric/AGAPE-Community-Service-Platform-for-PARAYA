"use client";

import { useEffect, useState } from "react";
import { Users, ShieldCheck, Database, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { UnifiedDashboardSummary } from "@/components/dashboard/UnifiedDashboardSummary";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  totalUsers:     number;
  pendingCount:   number;
  securityEvents: number;
  roleCounts: {
    paraya_officer:    number;
    volunteer:         number;
    barangay_official: number;
    admin:             number;
  };
  auditLogs: {
    user:   string;
    action: string;
    time:   string;
    level:  "Info" | "Warning" | "Error";
  }[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  paraya_director:        "#6B5B3E",
  paraya_associate:       "#8B7A5E",
  paraya_researcher:      "#4A3F2B",
  volunteer:              "#C4A96A",
  barangay_captain:       "#4A7C59",
  barangay_secretary:     "#6B9C7A",
  barangay_mother_leader: "#8DB59E",
  admin:                  "#5B7FA5",
  // Legacy aliases
  paraya_officer:         "#6B5B3E",
  barangay_official:      "#4A7C59",
};

const ROLE_LABELS: Record<string, string> = {
  paraya_director:        "PARAYA Director",
  paraya_associate:       "PARAYA Associate",
  paraya_researcher:      "PARAYA Researcher",
  volunteer:              "Volunteers",
  barangay_captain:       "Barangay Captain",
  barangay_secretary:     "Barangay Secretary",
  barangay_mother_leader: "Mother Leader",
  admin:                  "Admins",
  // Legacy aliases
  paraya_officer:         "PARAYA Officers",
  barangay_official:      "Barangay Officials",
};

const LEVEL_COLORS: Record<string, string> = {
  Info:    "bg-info/10 text-info",
  Warning: "bg-warning/10 text-warning",
  Error:   "bg-danger/10 text-danger",
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((j) => setData(j.data ?? null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading dashboard…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-32 text-center text-muted-foreground text-sm">
        Failed to load dashboard data. Please refresh.
      </div>
    );
  }

  const roleChartData = Object.entries(data.roleCounts)
    .filter(([, v]) => v > 0)
    .map(([role, value]) => ({
      name:  ROLE_LABELS[role] ?? role,
      value,
      color: ROLE_COLORS[role] ?? "#9C9488",
    }));

  const kpiCards = [
    {
      label: "Total Users",
      value: data.totalUsers,
      sub:   `+${data.pendingCount} pending approval`,
      icon:  Users,
    },
    {
      label: "Security Events",
      value: data.securityEvents,
      sub:   "Last 7 days",
      icon:  ShieldCheck,
    },
    {
      label: "DB Backups",
      value: "—",
      sub:   "Managed by Supabase",
      icon:  Database,
    },
    {
      label: "Pending Approvals",
      value: data.pendingCount,
      sub:   "Awaiting activation",
      icon:  AlertCircle,
    },
  ];

  return (
    <div className="space-y-6">
      <UnifiedDashboardSummary />

      {/* ── KPI Cards ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((stat) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Role Breakdown ─────────────────────────────────────────────────────── */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg">Users by Role</CardTitle>
          </CardHeader>
          <CardContent>
            {roleChartData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                No users yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={roleChartData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={3} dataKey="value"
                  >
                    {roleChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #E5DDD0", borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [Number(v), name]}
                  />
                  <Legend
                    iconType="circle" iconSize={8}
                    formatter={(v) => <span style={{ fontSize: 11, color: "#6B6356" }}>{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Audit Log ──────────────────────────────────────────────────────────── */}
        <Card className="lg:col-span-2 border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg">Recent Audit Log</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.auditLogs.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No audit events recorded yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-2 text-muted-foreground font-medium">User</th>
                    <th className="text-left px-2 py-2 text-muted-foreground font-medium">Action</th>
                    <th className="text-left px-2 py-2 text-muted-foreground font-medium">Time</th>
                    <th className="text-left px-2 pr-6 py-2 text-muted-foreground font-medium">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {data.auditLogs.map((log, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-surface-alt/40" : ""}>
                      <td className="px-6 py-2.5 text-xs text-muted-foreground max-w-[140px] truncate">{log.user}</td>
                      <td className="px-2 py-2.5 font-medium text-foreground text-xs">{log.action}</td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{log.time}</td>
                      <td className="px-2 pr-6 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_COLORS[log.level]}`}>
                          {log.level}
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
