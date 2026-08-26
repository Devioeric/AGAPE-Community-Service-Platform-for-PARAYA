"use client";

import { useEffect, useState } from "react";
import {
  Users, Clock, Activity, FileText, TrendingUp, Loader2, MapPin, Bot, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import type { AdvisoryRecommendationResponse } from "@/lib/ai/advisory-recommendations";

interface AnalyticsData {
  programs:    { total: number; byStatus: Record<string, number>; chartData: { status: string; count: number }[] };
  volunteers:  { total: number; active: number };
  hours:       { total: number; byMonth: { month: string; hours: number }[] };
  donations:   { total: number; totalQty: number };
  sdg:         { counts: { sdg: number; count: number }[] };
  proposals:   { total: number; byStatus: Record<string, number> };
  topBarangays: { name: string; count: number }[];
}

interface Program {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  end_date:   string | null;
  barangays:  { name: string } | null;
}

const SDG_META: Record<number, { label: string; short: string; color: string }> = {
  4:  { label: "SDG 4 — Quality Education",      short: "SDG 4",  color: "#C5192D" },
  9:  { label: "SDG 9 — Industry & Innovation",  short: "SDG 9",  color: "#FD6925" },
  11: { label: "SDG 11 — Sustainable Cities",    short: "SDG 11", color: "#FD9D24" },
  17: { label: "SDG 17 — Partnerships",          short: "SDG 17", color: "#19486A" },
};

const STATUS_COLORS: Record<string, string> = {
  active:       "bg-success/10 text-success",
  completed:    "bg-info/10 text-info",
  planning:     "bg-warning/10 text-warning",
  on_hold:      "bg-muted/30 text-muted-foreground",
  cancelled:    "bg-danger/10 text-danger",
};

function fmt(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

export default function OfficerDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [programs,  setPrograms]  = useState<Program[]>([]);
  const [recommendations, setRecommendations] = useState<AdvisoryRecommendationResponse | null>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/analytics").then((r) => r.json()),
      fetch("/api/programs").then((r) => r.json()),
      fetch("/api/ai/recommendations", { cache: "no-store" })
        .then(async (r) => r.ok ? r.json() : null)
        .catch(() => null),
    ])
      .then(([aJson, pJson, recommendationJson]) => {
        setAnalytics(aJson.data ?? null);
        const raw = (pJson.data ?? []) as Program[];
        setPrograms(raw.slice(0, 6));
        setRecommendations(recommendationJson?.data ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading dashboard…</span>
      </div>
    );
  }

  const a = analytics;

  const activePrograms  = a?.programs.byStatus["active"]      ?? 0;
  const pendingProposals =
    (a?.proposals.byStatus["pending"]      ?? 0) +
    (a?.proposals.byStatus["under_review"] ?? 0);

  const statCards = [
    {
      label: "Total Volunteers",
      value: fmt(a?.volunteers.total ?? 0),
      sub:   `${a?.volunteers.active ?? 0} active`,
      icon:  Users,
    },
    {
      label: "Volunteer Hours",
      value: fmt(a?.hours.total ?? 0),
      sub:   "all time logged",
      icon:  Clock,
    },
    {
      label: "Active Programs",
      value: String(activePrograms),
      sub:   `${a?.programs.total ?? 0} total programs`,
      icon:  Activity,
    },
    {
      label: "Pending Proposals",
      value: String(pendingProposals),
      sub:   `${a?.proposals.total ?? 0} total proposals`,
      icon:  FileText,
    },
  ];

  // SDG progress — normalise against the highest count
  const sdgCounts   = a?.sdg.counts ?? [];
  const maxSdgCount = Math.max(...sdgCounts.map((s) => s.count), 1);
  const sdgRows     = [4, 9, 11, 17].map((num) => {
    const found = sdgCounts.find((s) => s.sdg === num);
    const count = found?.count ?? 0;
    return {
      ...SDG_META[num],
      count,
      pct: Math.round((count / maxSdgCount) * 100),
    };
  });

  const hourChart = (a?.hours.byMonth ?? []).length > 0
    ? a!.hours.byMonth
    : [{ month: "—", hours: 0 }];

  const barangayChart = (a?.topBarangays ?? []).length > 0
    ? a!.topBarangays
    : [{ name: "No data", count: 0 }];

  return (
    <div className="space-y-6">
      {recommendations && recommendations.summary.recommendationCount > 0 && (
        <Card className="border-primary/25 bg-primary/5 shadow-card">
          <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><Bot className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="font-heading font-semibold text-foreground">
                  {recommendations.summary.recommendationCount} approved need{recommendations.summary.recommendationCount === 1 ? "" : "s"} need planning attention
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {recommendations.summary.unaddressedNeeds} have no planned response and {recommendations.summary.needsWithPlannedResponses} have a plan to review.
                </p>
              </div>
            </div>
            <Link href="/officer/analytics/recommendations" className="inline-flex items-center text-sm font-medium text-primary hover:text-primary-dark">
              Review recommendations <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="border-border shadow-card border-l-4 border-l-accent">
            <CardContent className="px-5 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-1 font-heading">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
                  <stat.icon className="w-5 h-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Volunteer Hours chart */}
        <Card className="xl:col-span-2 border-border shadow-card">
          <CardHeader className="px-6 pt-4 pb-2">
            <CardTitle className="font-heading text-lg text-foreground">
              Volunteer Hours — Last 6 Months
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourChart} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #E5DDD0", borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: "rgba(107,91,62,0.05)" }}
                />
                <Bar dataKey="hours" name="Hours" fill="#6B5B3E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* SDG Impact */}
        <Card className="border-border shadow-card">
          <CardHeader className="px-6 pt-4 pb-2">
            <CardTitle className="font-heading text-lg text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              SDG Impact
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-4 space-y-4">
            {sdgRows.map((sdg) => (
              <div key={sdg.short} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground/80 font-medium text-xs">{sdg.label}</span>
                  <span className="font-bold text-foreground tabular-nums">{sdg.count}</span>
                </div>
                <Progress
                  value={sdg.pct}
                  className="h-2"
                  style={{ "--progress-color": sdg.color } as React.CSSProperties}
                />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-1">
              Counts reflect SDG-aligned proposals
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Top Barangays */}
        <Card className="border-border shadow-card">
          <CardHeader className="px-6 pt-4 pb-2">
            <CardTitle className="font-heading text-lg text-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent" />
              Top Barangays
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barangayChart.length === 0 || barangayChart[0].name === "No data" ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No barangay data yet</p>
            ) : (
              <div className="space-y-3">
                {barangayChart.map((b, i) => (
                  <div key={b.name} className="flex items-center gap-3">
                    <span className="w-5 text-xs text-muted-foreground font-medium shrink-0">
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="truncate text-foreground/80">{b.name}</span>
                        <span className="font-semibold text-foreground shrink-0 ml-2">{b.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((b.count / barangayChart[0].count) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Programs */}
        <Card className="xl:col-span-2 border-border shadow-card">
          <CardHeader className="px-6 pt-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-lg text-foreground">Recent Programs</CardTitle>
            <Link href="/officer/programs" className="text-xs text-primary hover:text-primary-dark font-medium">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {programs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No programs yet.{" "}
                <Link href="/officer/programs" className="text-primary hover:underline">Create one →</Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Program</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Barangay</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Start</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programs.map((p, i) => (
                      <tr key={p.id} className={i % 2 === 0 ? "bg-surface-alt/40" : ""}>
                        <td className="py-2.5 px-3 font-medium text-foreground truncate max-w-[180px]">
                          {p.title}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {(p.barangays as { name: string } | null)?.name ?? "—"}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {p.start_date
                            ? new Date(p.start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
                            : "—"}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[p.status] ?? "bg-muted/30 text-muted-foreground"}`}>
                            {p.status.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
