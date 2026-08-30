"use client";

import { useState, useEffect } from "react";
import {
  Loader2, FileText, MapPin, ClipboardList, AlertCircle, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NeedRow {
  id:          string;
  barangay:    string;
  category:    string;
  title:       string;
  description: string;
  priority:    string;
  created_at:  string;
}

interface AnalyticsData {
  needs:                { byCategory: { category: string; count: number }[] };
  topBarangays:         { name: string; count: number }[];
  recentNeeds:          NeedRow[];
  surveysCompletedCount: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Health:         "#9B3B3B",
  Economic:       "#C4A96A",
  Environmental:  "#4A7C59",
  Social:         "#5B7FA5",
  Education:      "#C5192D",
  Infrastructure: "#6B5B3E",
  Other:          "#9C9488",
};

const FALLBACK_COLORS = [
  "#6B5B3E", "#C4A96A", "#4A7C59", "#5B7FA5", "#9B3B3B", "#B8860B", "#9C9488",
];

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-danger/10 text-danger border-danger/20 border"         },
  high:     { label: "High",     className: "bg-warning/10 text-warning border-warning/20 border"      },
  medium:   { label: "Medium",   className: "bg-info/10 text-info border-info/20 border"               },
  low:      { label: "Low",      className: "bg-muted/30 text-muted-foreground border border-border"   },
};

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncate(text: string, len = 70) {
  return text.length > len ? text.slice(0, len) + "…" : text;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function colorForCategory(category: string, index: number) {
  return CATEGORY_COLORS[category] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CommunityNeedsAnalyticsPage() {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    fetch("/api/analytics?type=community-needs")
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
        <span className="text-sm">Loading community needs analytics…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
        <ClipboardList className="w-10 h-10 opacity-30" />
        <p className="text-sm">Failed to load community needs data. Please refresh the page.</p>
      </div>
    );
  }

  const totalNeeds     = data.needs.byCategory.reduce((s, c) => s + c.count, 0);
  const barangaysCount = data.topBarangays.length;
  const highPriority   = data.recentNeeds.filter((n) => ["critical", "high"].includes(n.priority)).length;

  const pieData = data.needs.byCategory.map((item, i) => ({
    ...item,
    color: colorForCategory(item.category, i),
  }));

  const barangayBarData = data.topBarangays.slice(0, 8).map((b) => ({
    name:     b.name.length > 12 ? b.name.slice(0, 11) + "…" : b.name,
    fullName: b.name,
    count:    b.count,
  }));

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          Community Needs Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of community needs submissions from partner barangays, categorized and tracked over time.
        </p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Needs Submitted",
            value: totalNeeds,
            sub: "across all categories",
            icon: FileText,
            accent: "border-l-primary",
          },
          {
            label: "Barangays Reporting",
            value: barangaysCount,
            sub: "partner barangays active",
            icon: MapPin,
            accent: "border-l-accent",
          },
          {
            label: "Surveys Completed",
            value: data.surveysCompletedCount,
            sub: "needs assessment surveys",
            icon: CheckCircle2,
            accent: "border-l-success",
          },
          {
            label: "High Priority Needs",
            value: highPriority,
            sub: "critical or high priority",
            icon: AlertCircle,
            accent: "border-l-warning",
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

        {/* Pie chart: by category */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Needs by Category
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Distribution of submitted community needs across assessment categories.
            </p>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="h-[280px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <ClipboardList className="w-8 h-8 opacity-25" />
                <p className="text-sm">No needs data submitted yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="count"
                    nameKey="category"
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...CHART_STYLE.tooltip}
                    formatter={(v, name) => [`${Number(v)} needs`, String(name)]}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: 11, color: "#6B6356" }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Bar chart: by barangay (programs as proxy for addressed needs) */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Programs per Barangay
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Number of programs per partner barangay — proxy for needs being addressed.
            </p>
          </CardHeader>
          <CardContent>
            {barangayBarData.length === 0 ? (
              <div className="h-[280px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <MapPin className="w-8 h-8 opacity-25" />
                <p className="text-sm">No barangay data available yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={barangayBarData}
                  margin={{ top: 5, right: 16, left: 0, bottom: 32 }}
                >
                  <CartesianGrid {...CHART_STYLE.cartesianGrid} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#6B6356" }}
                    axisLine={false}
                    tickLine={false}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#6B6356" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...CHART_STYLE.tooltip}
                    labelFormatter={(label, payload) =>
                      payload?.[0]?.payload?.fullName ?? label
                    }
                    formatter={(v) => [`${Number(v)}`, "Programs"]}
                  />
                  <Bar dataKey="count" fill="#C4A96A" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Submissions Table ────────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-heading text-base">Recent Needs Submissions</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Latest needs reported by barangay officials, sorted by date.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-danger inline-block" />
                Critical
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-warning inline-block" />
                High
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-info inline-block" />
                Medium
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Barangay</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Category</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Description</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">
                    Date
                  </th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Priority</th>
                </tr>
              </thead>
              <tbody>
                {data.recentNeeds.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-muted-foreground text-sm">
                      No needs submissions yet.
                    </td>
                  </tr>
                ) : (
                  data.recentNeeds.map((need, i) => {
                    const catColor   = CATEGORY_COLORS[need.category] ?? "#9C9488";
                    const priorityCfg = PRIORITY_CONFIG[need.priority] ?? PRIORITY_CONFIG.medium;
                    return (
                      <tr
                        key={need.id}
                        className={`border-b border-border/60 transition-colors ${
                          i % 2 !== 0 ? "bg-surface-alt/20" : ""
                        }`}
                      >
                        <td className="py-3 px-4 font-medium text-foreground whitespace-nowrap">
                          {need.barangay}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white whitespace-nowrap"
                            style={{ backgroundColor: catColor }}
                          >
                            {need.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <p className="font-medium text-foreground">{need.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{truncate(need.description)}</p>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap hidden md:table-cell">
                          {fmtDate(need.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priorityCfg.className}`}
                          >
                            {priorityCfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
            Showing {data.recentNeeds.length} most recent needs submissions
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
