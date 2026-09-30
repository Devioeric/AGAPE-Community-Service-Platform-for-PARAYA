"use client";

import { PaginatedTable } from "@/components/shared/PaginatedTable";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { UnifiedDashboardSummary } from "@/components/dashboard/UnifiedDashboardSummary";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  totalUsers:     number;
  pendingCount:   number;
  securityEvents: number;
  roleCounts: Record<string, number>;
  auditLogs: {
    user:   string;
    action: string;
    time:   string;
    level:  "Info" | "Warning" | "Error";
  }[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  paraya_officer:         "#6B5B3E",
  finance_officer:        "#7A5B8B",
  volunteer:              "#C4A96A",
  barangay_secretary:     "#6B9C7A",
  admin:                  "#5B7FA5",
};

const ROLE_LABELS: Record<string, string> = {
  paraya_officer:         "PARAYA Officer",
  finance_officer:        "Finance Officer",
  volunteer:              "Volunteers",
  barangay_secretary:     "Barangay Secretary",
  admin:                  "Admins",
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

  const dashboardSummary = <UnifiedDashboardSummary />;

  if (loading) {
    return (
      <div className="space-y-6">
        {dashboardSummary}
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading dashboard details…</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {dashboardSummary}
        <div className="py-32 text-center text-sm text-muted-foreground">
          Failed to load dashboard details. Please refresh.
        </div>
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

  return (
    <div className="space-y-6">
      {dashboardSummary}

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
                    contentStyle={{ background: "#fff", border: "1px solid #E5DDD0", borderRadius: 8, fontSize: 13 }}
                    formatter={(v, name) => [Number(v), name]}
                  />
                  <Legend
                    iconType="circle" iconSize={8}
                    formatter={(v) => <span style={{ fontSize: 12, color: "#6B6356" }}>{v}</span>}
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
              <PaginatedTable rows={data.auditLogs} label="Recent audit entries">
                {(pageRows) => (
                  <table aria-label="Recent audit entries" className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-6 py-2 text-muted-foreground font-medium">User</th>
                        <th className="text-left px-2 py-2 text-muted-foreground font-medium">Action</th>
                        <th className="text-left px-2 py-2 text-muted-foreground font-medium">Time</th>
                        <th className="text-left px-2 pr-6 py-2 text-muted-foreground font-medium">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((log, i) => (
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
              </PaginatedTable>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
