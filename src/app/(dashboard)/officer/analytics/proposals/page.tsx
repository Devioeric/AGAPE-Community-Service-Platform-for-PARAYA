"use client";

import { useState, useEffect } from "react";
import {
  Loader2, FileText, CheckCircle2, XCircle, Clock, PenLine, ChevronRight, Eye,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

type ProposalStatus =
  | "draft" | "submitted" | "pre_screening"
  | "sdg_review" | "finance_review" | "approved" | "rejected";

interface ProposalRow {
  id:       string;
  title:    string;
  status:   string;
  barangay: string;
  sdgs:     number[];
  date:     string;
}

interface AnalyticsData {
  proposals:   { total: number; byStatus: Record<string, number> };
  proposalRows: ProposalRow[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_META: Record<
  ProposalStatus,
  { label: string; color: string; badgeClass: string; icon: React.ElementType }
> = {
  draft:          { label: "Draft",          color: "#9C9488", badgeClass: "bg-muted text-muted-foreground border",                  icon: PenLine      },
  submitted:      { label: "Submitted",      color: "#5B7FA5", badgeClass: "bg-info/10 text-info border-info/20 border",             icon: FileText     },
  pre_screening:  { label: "Pre-Screening",  color: "#B8860B", badgeClass: "bg-warning/10 text-warning border-warning/20 border",   icon: Clock        },
  sdg_review:     { label: "SDG Review",     color: "#C4A96A", badgeClass: "bg-warning/10 text-warning border-warning/20 border",   icon: Clock        },
  finance_review: { label: "Finance Review", color: "#C4A96A", badgeClass: "bg-warning/10 text-warning border-warning/20 border",   icon: Clock        },
  approved:       { label: "Approved",       color: "#4A7C59", badgeClass: "bg-success/10 text-success border-success/20 border",   icon: CheckCircle2 },
  rejected:       { label: "Rejected",       color: "#9B3B3B", badgeClass: "bg-danger/10 text-danger border-danger/20 border",      icon: XCircle      },
};

const PIPELINE_STAGES: ProposalStatus[] = [
  "draft", "submitted", "pre_screening", "sdg_review", "finance_review", "approved",
];

const SDG_COLORS: Record<number, string> = {
  4: "#C5192D", 9: "#FD6925", 11: "#FD9D24", 17: "#19486A",
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function conversionRate(from: number, to: number): string {
  if (from === 0) return "—";
  return `${Math.round((to / from) * 100)}%`;
}

// ─── Funnel Stage ───────────────────────────────────────────────────────────

function FunnelStage({
  stage, count, total, isLast, convFrom,
}: {
  stage: ProposalStatus; count: number; total: number; isLast: boolean; convFrom: number;
}) {
  const meta  = STATUS_META[stage];
  const width = total > 0 ? Math.max(Math.round((count / total) * 100), count > 0 ? 8 : 0) : 0;
  const Icon  = meta.icon;
  const conv  = stage !== "draft" ? conversionRate(convFrom, count) : null;

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${meta.color}20` }}
      >
        <Icon className="w-4 h-4" style={{ color: meta.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-foreground">{meta.label}</span>
          <div className="flex items-center gap-2">
            {conv && (
              <span className="text-[10px] text-muted-foreground">conv. {conv}</span>
            )}
            <span className="text-sm font-bold text-foreground tabular-nums">{count}</span>
          </div>
        </div>
        <div className="h-2 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${width}%`, backgroundColor: meta.color }}
          />
        </div>
      </div>
      {!isLast && (
        <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProposalPipelinePage() {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    fetch("/api/analytics?type=proposals")
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
        <span className="text-sm">Loading proposal pipeline…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
        <FileText className="w-10 h-10 opacity-30" />
        <p className="text-sm">Failed to load proposal data. Please refresh the page.</p>
      </div>
    );
  }

  const byStatus = data.proposals.byStatus;
  const total    = data.proposals.total;

  const statusCounts: Record<ProposalStatus, number> = {
    draft:          byStatus["draft"]          ?? 0,
    submitted:      byStatus["submitted"]      ?? 0,
    pre_screening:  byStatus["pre_screening"]  ?? 0,
    sdg_review:     byStatus["sdg_review"]     ?? 0,
    finance_review: byStatus["finance_review"] ?? 0,
    approved:       byStatus["approved"]       ?? 0,
    rejected:       byStatus["rejected"]       ?? 0,
  };

  const inReviewCount =
    statusCounts.submitted +
    statusCounts.pre_screening +
    statusCounts.sdg_review +
    statusCounts.finance_review;

  const chartData = [
    { label: "Approved",       count: statusCounts.approved,       color: "#4A7C59" },
    { label: "Finance Review", count: statusCounts.finance_review, color: "#C4A96A" },
    { label: "SDG Review",     count: statusCounts.sdg_review,     color: "#C4A96A" },
    { label: "Pre-Screening",  count: statusCounts.pre_screening,  color: "#B8860B" },
    { label: "Submitted",      count: statusCounts.submitted,      color: "#5B7FA5" },
    { label: "Draft",          count: statusCounts.draft,          color: "#9C9488" },
    { label: "Rejected",       count: statusCounts.rejected,       color: "#9B3B3B" },
  ].filter((d) => d.count > 0);

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          Proposal Pipeline
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track project proposals through the PARAYA multi-stage approval workflow, from drafting to final approval.
        </p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total",        value: total,                    accent: "border-l-primary",          icon: FileText     },
          { label: "Draft",        value: statusCounts.draft,       accent: "border-l-muted-foreground",  icon: PenLine      },
          { label: "Under Review", value: inReviewCount,            accent: "border-l-warning",           icon: Clock        },
          { label: "Approved",     value: statusCounts.approved,    accent: "border-l-success",           icon: CheckCircle2 },
          { label: "Rejected",     value: statusCounts.rejected,    accent: "border-l-danger",            icon: XCircle      },
        ].map(({ label, value, accent, icon: Icon }) => (
          <Card key={label} className={`border-border shadow-card border-l-4 ${accent}`}>
            <CardContent className="px-4 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className="text-2xl font-bold font-heading text-foreground">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Status Bar Chart ───────────────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Proposals by Status
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Current distribution of proposals across all pipeline stages.
          </p>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileText className="w-8 h-8 opacity-25" />
              <p className="text-sm">No proposals submitted yet.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 56, left: 12, bottom: 5 }}
              >
                <CartesianGrid {...CHART_STYLE.cartesianGrid} horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#6B6356" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={104}
                  tick={{ fontSize: 11, fill: "#6B6356" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  {...CHART_STYLE.tooltip}
                  formatter={(v) => [`${Number(v)} proposals`, "Count"]}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {chartData.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    style={{ fontSize: 11, fill: "#6B6356" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Pipeline Funnel ────────────────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base">Approval Pipeline Funnel</CardTitle>
          <p className="text-xs text-muted-foreground">
            Proposal flow from draft through final approval. Conversion rates show the percentage that advanced to each stage.
          </p>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
              <FileText className="w-8 h-8 opacity-25" />
              <p className="text-sm">No proposals in the pipeline yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {PIPELINE_STAGES.map((stage, i) => {
                const prevStage = i > 0 ? PIPELINE_STAGES[i - 1] : null;
                const prevCount = prevStage ? statusCounts[prevStage] : total;
                return (
                  <FunnelStage
                    key={stage}
                    stage={stage}
                    count={statusCounts[stage]}
                    total={total}
                    isLast={i === PIPELINE_STAGES.length - 1}
                    convFrom={prevCount}
                  />
                );
              })}

              <div className="pt-3 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#9B3B3B20" }}>
                    <XCircle className="w-4 h-4 text-danger" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">Rejected</span>
                      <span className="text-sm font-bold text-foreground tabular-nums">{statusCounts.rejected}</span>
                    </div>
                    <div className="h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-danger transition-all duration-500"
                        style={{ width: total > 0 ? `${Math.round((statusCounts.rejected / total) * 100)}%` : "0%" }}
                      />
                    </div>
                  </div>
                  <div className="w-3" />
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overall approval rate</span>
                <span className="font-bold text-success">
                  {conversionRate(total, statusCounts.approved)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Proposals Table ────────────────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-heading text-base">All Proposals</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.proposalRows.length} proposal{data.proposalRows.length !== 1 ? "s" : ""} — click View to open the full proposal.
              </p>
            </div>
            <Link
              href="/officer/proposals"
              className="text-xs font-medium text-primary hover:text-primary-dark transition-colors"
            >
              Manage proposals →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Title</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">
                    Barangay
                  </th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">SDGs</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden lg:table-cell">
                    Date
                  </th>
                  <th className="py-3 px-4 w-10" />
                </tr>
              </thead>
              <tbody>
                {data.proposalRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground text-sm">
                      No proposals submitted yet.{" "}
                      <Link href="/officer/proposals" className="text-primary hover:underline">
                        Create the first one →
                      </Link>
                    </td>
                  </tr>
                ) : (
                  data.proposalRows.map((row, i) => {
                    const meta = STATUS_META[row.status as ProposalStatus] ?? STATUS_META.draft;
                    return (
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
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {row.sdgs.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {row.sdgs.map((n) => (
                                <span
                                  key={n}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                                  style={{ backgroundColor: SDG_COLORS[n] ?? "#9C9488" }}
                                  title={`SDG ${n}`}
                                >
                                  SDG {n}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                          {fmtDate(row.date)}
                        </td>
                        <td className="py-3 px-4">
                          <Link
                            href="/officer/proposals"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors"
                            title="View proposal"
                          >
                            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
            {data.proposalRows.length} proposals · Full management available in{" "}
            <Link href="/officer/proposals" className="text-primary hover:underline">
              Proposals module
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
