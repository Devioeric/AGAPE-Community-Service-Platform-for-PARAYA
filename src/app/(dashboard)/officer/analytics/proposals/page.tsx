"use client";

import { PaginatedTable } from "@/components/shared/PaginatedTable";

import { useAnalyticsView } from "@/lib/analytics/use-analytics-view";
import {
  Loader2, FileText, CheckCircle2, XCircle, Clock, PenLine, ChevronRight, Eye, RotateCcw,
  CalendarDays, Wallet, MapPin, Repeat, ShieldCheck, Users, Banknote,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, Legend,
} from "recharts";
import { ChartCard, EmptyChart, PALETTE, RatioRow, STAGE_META, axisTick, gridProps, legendProps, peso, shortLabel, tooltipProps } from "@/components/analytics/chart-kit";

const STAGE_KEYS = ["approved", "in_review", "revisions", "draft", "rejected"] as const;

// ─── Types ──────────────────────────────────────────────────────────────────

type ProposalStatus =
  | "draft" | "submitted" | "pre_screening"
  | "sdg_review" | "finance_review" | "approved" | "rejected" | "revisions_requested";



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
  revisions_requested: { label: "Revisions Requested", color: "#B8860B", badgeClass: "bg-warning/10 text-warning border-warning/20 border", icon: RotateCcw },
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
      fontSize: "13px",
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
  stage, count, current, total, isLast, convFrom,
}: {
  stage: ProposalStatus; count: number; current: number; total: number; isLast: boolean; convFrom: number;
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
            <span className="text-[11px] text-muted-foreground">{current} here</span>
            {conv && (
              <span className="text-[11px] text-muted-foreground">conv. {conv}</span>
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
  const { data, loading, error, denied, retry } = useAnalyticsView("proposals");

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
        <p className="text-sm">{denied ? "You do not have access to this analytics view." : "Analytics data is temporarily unavailable."}</p>
        {!denied && <button onClick={retry} className="rounded border border-border px-4 py-2 focus-visible:ring-2 focus-visible:ring-primary">Retry</button>}
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
    revisions_requested: byStatus["revisions_requested"] ?? 0,
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
    { label: "Revisions",      count: statusCounts.revisions_requested, color: "#B8860B" },
    { label: "Rejected",       count: statusCounts.rejected,       color: "#9B3B3B" },
  ].filter((d) => d.count > 0);

  const insights = data.proposalInsights;
  const budgetData = (insights?.budgetByStage ?? []).map((row) => ({ ...row, label: STAGE_META[row.stage as keyof typeof STAGE_META]?.label ?? row.stage, color: STAGE_META[row.stage as keyof typeof STAGE_META]?.color ?? PALETTE.muted }));
  const barangayData = (insights?.byBarangay ?? []).map((row) => ({ ...row, name: shortLabel(row.barangay, 18) }));
  const count = (rows: Array<{ count: number }>, index: number) => rows[index]?.count ?? 0;
  const prescreenRun = count(insights?.prescreening ?? [], 0) + count(insights?.prescreening ?? [], 1);
  const incomeGenerating = count(insights?.finance ?? [], 1) + count(insights?.finance ?? [], 2);

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total",        value: total,                    accent: "border-l-primary",          icon: FileText     },
          { label: "Draft",        value: statusCounts.draft,       accent: "border-l-muted-foreground",  icon: PenLine      },
          { label: "Under Review", value: inReviewCount,            accent: "border-l-warning",           icon: Clock        },
          { label: "Revisions",    value: statusCounts.revisions_requested, accent: "border-l-warning",  icon: RotateCcw    },
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

      {insights && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 -mt-4">
        {[
          { label: "Budget Requested", value: peso(insights.totals.requestedBudget), sub: `average ${peso(insights.totals.averageBudget)} per proposal`, icon: Wallet },
          { label: "Budget Approved", value: peso(insights.totals.approvedBudget), sub: insights.totals.requestedBudget ? `${Math.round((insights.totals.approvedBudget / insights.totals.requestedBudget) * 100)}% of requested` : "no budgets yet", icon: Banknote },
          { label: "Expected Beneficiaries", value: insights.totals.expectedBeneficiaries.toLocaleString(), sub: "across all proposals", icon: Users },
          { label: "Approved Reach", value: insights.totals.approvedBeneficiaries.toLocaleString(), sub: "beneficiaries in approved proposals", icon: CheckCircle2 },
        ].map(({ label, value, sub, icon: Icon }) => (
          <Card key={label} className="border-border shadow-card">
            <CardContent className="px-4 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className="text-xl font-bold font-heading text-foreground">{value}</p>
              <p className="text-[11px] text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>}

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
                  tick={{ fontSize: 12, fill: "#6B6356" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={104}
                  tick={{ fontSize: 12, fill: "#6B6356" }}
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
                    style={{ fontSize: 12, fill: "#6B6356" }}
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
            Proposals that reached each stage or went further. Conversion is the share of the previous stage that advanced; “here” is where proposals sit now.
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
                const reached = (index: number) => index === 0 ? total
                  : index === 1 ? total - statusCounts.draft
                  : PIPELINE_STAGES.slice(index).reduce((sum, later) => sum + statusCounts[later], 0);
                return (
                  <FunnelStage
                    key={stage}
                    stage={stage}
                    count={reached(i)}
                    current={statusCounts[stage]}
                    total={total}
                    isLast={i === PIPELINE_STAGES.length - 1}
                    convFrom={i > 0 ? reached(i - 1) : total}
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

      {insights && (<>
      {/* ── Submission trend ────────────────────────────────────────────────── */}
      <ChartCard title="Proposals Submitted per Month" description="New proposals by creation month, coloured by where each one is now." icon={CalendarDays}>
        {insights.monthly.every((row) => row.total === 0) ? <EmptyChart message="No dated proposals yet." icon={CalendarDays} /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={insights.monthly} margin={{ top: 5, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipProps} />
              <Legend {...legendProps} />
              {STAGE_KEYS.map((key) => (
                <Bar key={key} dataKey={key} name={STAGE_META[key].label} stackId="stage" fill={STAGE_META[key].color} maxBarSize={40} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── Budget and barangay distribution ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Budget by Pipeline Stage" description="Total proposal budget sitting at each stage." icon={Wallet}>
          {budgetData.every((row) => row.budget === 0) ? <EmptyChart message="No proposal budgets recorded yet." icon={Wallet} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={budgetData} layout="vertical" margin={{ top: 5, right: 72, left: 8, bottom: 5 }}>
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => peso(Number(v), true)} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={136} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} formatter={(v, _name, item) => [`${peso(Number(v))} · ${item?.payload?.count ?? 0} proposals`, "Budget"]} />
                <Bar dataKey="budget" radius={[0, 6, 6, 0]} maxBarSize={26}>
                  {budgetData.map((row) => <Cell key={row.stage} fill={row.color} />)}
                  <LabelList dataKey="budget" position="right" formatter={(v) => peso(Number(v), true)} style={{ fontSize: 12, fill: PALETTE.text }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Proposals by Barangay" description="Proposals per barangay, stacked by pipeline stage." icon={MapPin}>
          {barangayData.length === 0 ? <EmptyChart message="No proposals yet." icon={MapPin} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barangayData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} labelFormatter={(value, payload) => payload?.[0]?.payload?.barangay ?? value} />
                <Legend {...legendProps} />
                {STAGE_KEYS.map((key) => (
                  <Bar key={key} dataKey={key} name={STAGE_META[key].label} stackId="stage" fill={STAGE_META[key].color} maxBarSize={56} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Review quality ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Revision Rounds" description="How many times proposals were sent back before a decision." icon={Repeat}>
          {total === 0 ? <EmptyChart message="No proposals yet." icon={Repeat} /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={insights.revisions} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="rounds" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} formatter={(v) => [`${Number(v)} proposals`, "Count"]} />
                <Bar dataKey="count" fill={PALETTE.warning} radius={[6, 6, 0, 0]} maxBarSize={56}>
                  <LabelList dataKey="count" position="top" style={{ fontSize: 12, fill: PALETTE.text }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Review Checkpoints" description="How many proposals have cleared each gate in the review workflow." icon={ShieldCheck}>
          {total === 0 ? <EmptyChart message="No proposals yet." icon={ShieldCheck} /> : (
            <div className="space-y-5 py-2">
              <RatioRow label="Automatic pre-screening run" value={prescreenRun} total={total} color={PALETTE.info} />
              <RatioRow label="Passed pre-screening" value={count(insights.prescreening, 0)} total={Math.max(prescreenRun, 0)} color={PALETTE.success}
                detail={prescreenRun ? `${count(insights.prescreening, 0)} of ${prescreenRun} screened` : "none screened yet"} />
              <RatioRow label="Validated with the community" value={insights.totals.communityValidated} total={total} color={PALETTE.primary} />
              <RatioRow label="Income-generating, finance cleared" value={count(insights.finance, 1)} total={incomeGenerating} color={PALETTE.accent}
                detail={incomeGenerating ? `${count(insights.finance, 1)} of ${incomeGenerating} cleared` : "no income-generating proposals"} />
            </div>
          )}
        </ChartCard>
      </div>

      </>)}

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
            <PaginatedTable rows={data.proposalRows} label="Proposal analytics">
              {(pageRows) => (
                <table aria-label="Proposal analytics" className="w-full text-sm">
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
                      pageRows.map((row, i) => {
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
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold text-white"
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
              )}
            </PaginatedTable>
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
