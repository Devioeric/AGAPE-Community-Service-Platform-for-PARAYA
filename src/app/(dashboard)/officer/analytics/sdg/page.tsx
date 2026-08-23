"use client";

import { useState, useEffect } from "react";
import {
  Loader2, TrendingUp, Users, BookOpen, Building2, Handshake, Factory,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProposalRow {
  id:       string;
  title:    string;
  status:   string;
  barangay: string;
  sdgs:     number[];
  date:     string;
}

interface SdgAnalyticsData {
  sdg:      { counts: { sdg: number; count: number }[] };
  programs: { total: number; byStatus: Record<string, number>; chartData: { status: string; count: number }[] };
  proposals:{ total: number; byStatus: Record<string, number> };
  proposalRows: ProposalRow[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SDG_META: Record<
  number,
  { label: string; description: string; color: string; target: number; icon: React.ElementType }
> = {
  4: {
    label: "Quality Education",
    description: "Ensure inclusive and equitable quality education",
    color: "#C5192D",
    target: 10,
    icon: BookOpen,
  },
  9: {
    label: "Industry & Innovation",
    description: "Build resilient infrastructure and foster innovation",
    color: "#FD6925",
    target: 8,
    icon: Factory,
  },
  11: {
    label: "Sustainable Cities",
    description: "Make cities inclusive, safe, resilient and sustainable",
    color: "#FD9D24",
    target: 12,
    icon: Building2,
  },
  17: {
    label: "Partnerships",
    description: "Strengthen global partnerships for sustainable development",
    color: "#19486A",
    target: 6,
    icon: Handshake,
  },
};

const SDG_NUMBERS = [4, 9, 11, 17];

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
  active:         "bg-success/10 text-success border-success/20 border",
  completed:      "bg-info/10 text-info border-info/20 border",
  planning:       "bg-warning/10 text-warning border-warning/20 border",
  on_hold:        "bg-muted/30 text-muted-foreground",
  cancelled:      "bg-danger/10 text-danger border-danger/20 border",
  draft:          "bg-muted text-muted-foreground border",
  upcoming:       "bg-info/10 text-info border-info/20 border",
  submitted:      "bg-info/10 text-info border-info/20 border",
  pre_screening:  "bg-warning/10 text-warning border-warning/20 border",
  sdg_review:     "bg-warning/10 text-warning border-warning/20 border",
  finance_review: "bg-warning/10 text-warning border-warning/20 border",
  approved:       "bg-success/10 text-success border-success/20 border",
  rejected:       "bg-danger/10 text-danger border-danger/20 border",
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SdgTrackerPage() {
  const [data, setData]       = useState<SdgAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    fetch("/api/analytics?type=sdg")
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
        <span className="text-sm">Loading SDG tracker…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
        <TrendingUp className="w-10 h-10 opacity-30" />
        <p className="text-sm">Failed to load SDG data. Please refresh the page.</p>
      </div>
    );
  }

  const sdgCounts = SDG_NUMBERS.reduce<Record<number, number>>((acc, n) => {
    acc[n] = data.sdg.counts.find((c) => c.sdg === n)?.count ?? 0;
    return acc;
  }, {});

  const BENEFICIARIES_PER_PROGRAM = 80;

  const chartData = SDG_NUMBERS.map((n) => ({
    sdg:   `SDG ${n}`,
    count: sdgCounts[n],
    color: SDG_META[n].color,
  }));

  const totalAligned = Object.values(sdgCounts).reduce((s, c) => s + c, 0);

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          SDG Impact Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tracking PARAYA&apos;s alignment with the UN Sustainable Development Goals across all programs and proposals.
        </p>
      </div>

      {/* ── Summary KPI ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border shadow-card border-l-4 border-l-primary">
          <CardContent className="px-5 py-3">
            <p className="text-sm text-muted-foreground">Total Aligned</p>
            <p className="text-3xl font-bold font-heading text-foreground mt-0.5">{totalAligned}</p>
            <p className="text-xs text-muted-foreground mt-0.5">proposals across 4 SDGs</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-card border-l-4 border-l-accent">
          <CardContent className="px-5 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Est. Beneficiaries</p>
            </div>
            <p className="text-3xl font-bold font-heading text-foreground">
              {(totalAligned * BENEFICIARIES_PER_PROGRAM).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">cumulative reach</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-card border-l-4" style={{ borderLeftColor: "#C5192D" }}>
          <CardContent className="px-5 py-3">
            <p className="text-sm text-muted-foreground">Most Active SDG</p>
            <p className="text-3xl font-bold font-heading text-foreground mt-0.5">
              {(() => {
                const top = SDG_NUMBERS.reduce((a, b) => sdgCounts[a] >= sdgCounts[b] ? a : b);
                return `SDG ${top}`;
              })()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(() => {
                const top = SDG_NUMBERS.reduce((a, b) => sdgCounts[a] >= sdgCounts[b] ? a : b);
                return SDG_META[top].label;
              })()}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-card border-l-4 border-l-success">
          <CardContent className="px-5 py-3">
            <p className="text-sm text-muted-foreground">Active Programs</p>
            <p className="text-3xl font-bold font-heading text-foreground mt-0.5">
              {data.programs.byStatus["active"] ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">of {data.programs.total} total</p>
          </CardContent>
        </Card>
      </div>

      {/* ── SDG Breakdown Cards ─────────────────────────────────────────────── */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground mb-4">SDG Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SDG_NUMBERS.map((n) => {
            const meta  = SDG_META[n];
            const count = sdgCounts[n];
            const pct   = Math.min(Math.round((count / meta.target) * 100), 100);
            const Icon  = meta.icon;
            return (
              <Card
                key={n}
                className="border-border shadow-card border-l-4 overflow-hidden"
                style={{ borderLeftColor: meta.color }}
              >
                <CardContent className="px-5 py-3">
                  <div className="flex items-start justify-between mb-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      SDG {n}
                    </span>
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${meta.color}18` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: meta.color }} />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-tight">{meta.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                    {meta.description}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-2xl font-bold font-heading text-foreground">{count}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">aligned proposals</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-heading text-foreground">
                        {(count * BENEFICIARIES_PER_PROGRAM).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">est. beneficiaries</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">Progress to target ({meta.target})</span>
                      <span className="text-[10px] font-semibold text-foreground">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: meta.color }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Bar Chart: Proposals per SDG ────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Proposals Aligned per SDG
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Number of approved and in-review proposals mapped to each Sustainable Development Goal.
          </p>
        </CardHeader>
        <CardContent>
          {totalAligned === 0 ? (
            <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <TrendingUp className="w-8 h-8 opacity-25" />
              <p className="text-sm">No SDG-aligned proposals yet.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid {...CHART_STYLE.cartesianGrid} vertical={false} />
                <XAxis
                  dataKey="sdg"
                  tick={{ fontSize: 12, fill: "#6B6356", fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#6B6356" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  {...CHART_STYLE.tooltip}
                  formatter={(v) => [`${Number(v)} proposals`, "Aligned"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={80}>
                  {chartData.map((entry) => (
                    <Cell key={entry.sdg} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Proposals Table with SDG Tags ────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base">
            Proposals &amp; SDG Alignment
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            All submitted proposals with their SDG alignment tags and current status.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Proposal</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">
                    Barangay
                  </th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">SDG Alignment</th>
                </tr>
              </thead>
              <tbody>
                {data.proposalRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-16 text-center text-muted-foreground text-sm">
                      No proposals with SDG alignment recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.proposalRows.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-border/60 transition-colors ${
                        i % 2 !== 0 ? "bg-surface-alt/20" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium text-foreground leading-snug">{row.title}</p>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                        {row.barangay}
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
                      <td className="py-3 px-4">
                        {row.sdgs.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.sdgs.map((n) => {
                              const meta = SDG_META[n];
                              return meta ? (
                                <span
                                  key={n}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold text-white"
                                  style={{ backgroundColor: meta.color }}
                                  title={meta.label}
                                >
                                  SDG {n}
                                </span>
                              ) : null;
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data.proposalRows.length > 0 && (
            <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
              {data.proposalRows.length} proposal{data.proposalRows.length !== 1 ? "s" : ""} total
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
