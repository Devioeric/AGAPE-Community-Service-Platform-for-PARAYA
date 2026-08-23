"use client";

import { useState, useEffect } from "react";
import {
  Loader2, Users, Clock, TrendingUp, MapPin, BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProgramStat {
  id:             string;
  title:          string;
  status:         string;
  barangay:       string;
  volunteerCount: number;
  totalHours:     number;
}

interface TopVolunteer {
  label: string;
  hours: number;
}

interface AnalyticsData {
  volunteers:   { total: number; active: number };
  hours:        { total: number; byMonth: { month: string; hours: number }[] };
  topBarangays: { name: string; count: number }[];
  programStats: ProgramStat[];
  topVolunteers: TopVolunteer[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CHART_STYLE = {
  cartesianGrid: { strokeDasharray: "3 3", stroke: "#E5DDD0" },
  tooltip: {
    contentStyle: {
      background: "#FFFFFF",
      border: "1px solid #E5DDD0",
      borderRadius: "8px",
      fontSize: "12px",
      color: "#2C2416",
    },
  },
};

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-success/10 text-success border-success/20 border",
  completed: "bg-info/10 text-info border-info/20 border",
  planning:  "bg-warning/10 text-warning border-warning/20 border",
  on_hold:   "bg-muted/30 text-muted-foreground",
  cancelled: "bg-danger/10 text-danger border-danger/20 border",
  draft:     "bg-muted text-muted-foreground border",
  upcoming:  "bg-info/10 text-info border-info/20 border",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function VolunteerAnalyticsPage() {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    fetch("/api/analytics?type=volunteers")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((j) => setData(j.data ?? null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading volunteer analytics…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
        <Users className="w-10 h-10 opacity-30" />
        <p className="text-sm">Failed to load volunteer data. Please refresh the page.</p>
      </div>
    );
  }

  const avgHours = data.volunteers.total > 0
    ? (data.hours.total / data.volunteers.total).toFixed(1)
    : "0";

  const mostActiveBarangay = data.topBarangays[0]?.name ?? "—";

  const hoursChartData = data.hours.byMonth.length > 0
    ? data.hours.byMonth
    : [{ month: "—", hours: 0 }];

  const totalProgramHours = data.programStats.reduce((s, r) => s + r.totalHours, 0);
  const totalProgramVols  = data.programStats.reduce((s, r) => s + r.volunteerCount, 0);

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Volunteer Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track volunteer engagement, hours logged, and program participation across all barangays.
        </p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Volunteers",
            value: fmt(data.volunteers.total),
            sub: `${data.volunteers.active} currently active`,
            icon: Users,
            accent: "border-l-primary",
          },
          {
            label: "Total Hours Logged",
            value: fmt(data.hours.total),
            sub: "approved service hours",
            icon: Clock,
            accent: "border-l-accent",
          },
          {
            label: "Avg Hours / Volunteer",
            value: avgHours,
            sub: "per registered volunteer",
            icon: TrendingUp,
            accent: "border-l-success",
          },
          {
            label: "Most Active Barangay",
            value: mostActiveBarangay,
            sub: `${data.topBarangays[0]?.count ?? 0} programs hosted`,
            icon: MapPin,
            accent: "border-l-info",
          },
        ].map(({ label, value, sub, icon: Icon, accent }) => (
          <Card key={label} className={`border-border shadow-card border-l-4 ${accent}`}>
            <CardContent className="px-5 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
              <p className="text-2xl font-bold font-heading text-foreground leading-tight mt-0.5">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Line chart: hours over 6 months */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Volunteer Hours — Last 6 Months
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Approved activity hours submitted by volunteers each month.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={hoursChartData}
                margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
              >
                <CartesianGrid {...CHART_STYLE.cartesianGrid} vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#6B6356" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6B6356" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  {...CHART_STYLE.tooltip}
                  formatter={(v) => [`${Number(v)} hrs`, "Hours"]}
                />
                <Line
                  type="monotone"
                  dataKey="hours"
                  stroke="#6B5B3E"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#6B5B3E", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#C4A96A" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bar chart: top 5 volunteers by hours (anonymized) */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Top 5 Volunteers by Hours
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Identities anonymized in compliance with data privacy guidelines.
            </p>
          </CardHeader>
          <CardContent>
            {data.topVolunteers.length === 0 ? (
              <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <BarChart3 className="w-8 h-8 opacity-25" />
                <p className="text-sm">No approved hours logged yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={data.topVolunteers}
                  layout="vertical"
                  margin={{ top: 5, right: 36, left: 8, bottom: 5 }}
                >
                  <CartesianGrid {...CHART_STYLE.cartesianGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#6B6356" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={88}
                    tick={{ fontSize: 11, fill: "#6B6356" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...CHART_STYLE.tooltip}
                    formatter={(v) => [`${Number(v)} hrs`, "Hours"]}
                  />
                  <Bar dataKey="hours" fill="#C4A96A" radius={[0, 6, 6, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground -mt-4 px-1">
        * Top volunteer chart uses anonymized labels. Actual volunteer data is visible to authorized officers in the Volunteer Roster.
      </p>

      {/* ── Programs Table ─────────────────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base">
            Volunteer Participation by Program
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Total volunteer count and combined hours logged per program.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Program</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">
                    Barangay
                  </th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Volunteers</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Total Hours</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Share</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.programStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground text-sm">
                      No program participation data available yet.
                    </td>
                  </tr>
                ) : (
                  data.programStats.map((row, i) => {
                    const sharePct = totalProgramHours > 0
                      ? Math.round((row.totalHours / totalProgramHours) * 100)
                      : 0;
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-border/60 transition-colors ${
                          i % 2 !== 0 ? "bg-surface-alt/20" : ""
                        }`}
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium text-foreground">{row.title}</p>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                          {row.barangay}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-foreground tabular-nums">
                          {row.volunteerCount}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-foreground tabular-nums">
                          {row.totalHours.toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${sharePct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-7 text-right tabular-nums">
                              {sharePct}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                              STATUS_BADGE[row.status] ?? "bg-muted/30 text-muted-foreground"
                            }`}
                          >
                            {row.status.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {data.programStats.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-surface-alt/30">
                    <td className="py-2.5 px-4 text-sm font-semibold text-foreground">Total</td>
                    <td className="py-2.5 px-4 hidden md:table-cell" />
                    <td className="py-2.5 px-4 text-right text-sm font-bold text-foreground tabular-nums">
                      {totalProgramVols}
                    </td>
                    <td className="py-2.5 px-4 text-right text-sm font-bold text-foreground tabular-nums">
                      {totalProgramHours.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4" />
                    <td className="py-2.5 px-4" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Top Barangays Bar ──────────────────────────────────────────────── */}
      {data.topBarangays.length > 0 && (
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Program Distribution by Barangay
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topBarangays.map(({ name, count }, i) => {
                const max = data.topBarangays[0]?.count ?? 1;
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-5 flex-shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-foreground truncate">{name}</p>
                        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0 tabular-nums">
                          {count} program{count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${Math.round((count / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
