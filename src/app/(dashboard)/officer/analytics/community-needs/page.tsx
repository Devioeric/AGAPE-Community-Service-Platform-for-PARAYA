"use client";

import { PaginatedTable } from "@/components/shared/PaginatedTable";

import { useAnalyticsView } from "@/lib/analytics/use-analytics-view";
import type { AnalyticsViewData } from "@/lib/analytics/view-contract";
import {
  Loader2, FileText, MapPin, ClipboardList, AlertCircle, CheckCircle2, Users, CalendarDays, Gauge, Layers, ListChecks,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts";
import {
  ChartCard, EmptyChart, PALETTE, PRIORITY_META, axisTick, gridProps, legendProps, needCategoryColor, shortLabel, tooltipProps,
} from "@/components/analytics/chart-kit";
import { CommunityProfileComparison } from "@/components/community-profile/CommunityProfileComparison";

// ─── Constants ──────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-danger/10 text-danger border-danger/20 border"         },
  high:     { label: "High",     className: "bg-warning/10 text-warning border-warning/20 border"      },
  medium:   { label: "Medium",   className: "bg-info/10 text-info border-info/20 border"               },
  low:      { label: "Low",      className: "bg-muted/30 text-muted-foreground border border-border"   },
};

const NEED_STATUS_META = {
  identified:  { label: "Identified",  color: PALETTE.muted },
  in_progress: { label: "In progress", color: PALETTE.accent },
  addressed:   { label: "Addressed",   color: PALETTE.success },
} as const;

const REVIEW_META: Record<string, { label: string; color: string }> = {
  pending_paraya_review: { label: "Awaiting review", color: PALETTE.info },
  needs_revision:        { label: "Returned",        color: PALETTE.warning },
  approved:              { label: "Approved",        color: PALETTE.success },
  rejected:              { label: "Rejected",        color: PALETTE.danger },
};

const PRIORITY_KEYS = ["critical", "high", "medium", "low"] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncate(text: string, len = 70) {
  return text.length > len ? text.slice(0, len) + "…" : text;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CommunityNeedsAnalyticsPage() {
  const { data, loading, error, denied, retry } = useAnalyticsView("community-needs");

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
        <p className="text-sm">{denied ? "You do not have access to this analytics view." : "Analytics data is temporarily unavailable."}</p>
        {!denied && <button onClick={retry} className="rounded border border-border px-4 py-2 focus-visible:ring-2 focus-visible:ring-primary">Retry</button>}
      </div>
    );
  }

  const insights = data.needsInsights;
  const pieData = data.needs.byCategory.map((item, i) => ({ ...item, color: needCategoryColor(item.category, i) }));

  return (
    <div className="space-y-8 animate-fade-in">

      {insights && <NeedsKpis insights={insights} />}

      {/* ── Household profile evidence (imported profiling tables) ────────── */}
      <CommunityProfileComparison />

      {insights ? (
        <NeedsCharts insights={insights} pieData={pieData} />
      ) : (
        <CategoryDonut pieData={pieData} />
      )}

      {/* ── Recent Submissions Table ────────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-heading text-base">Recent Needs Submissions</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Latest approved needs from partner barangays, sorted by date.
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
            <PaginatedTable rows={data.recentNeeds} label="Community needs">
              {(pageRows) => (
                <table aria-label="Community needs" className="w-full text-sm">
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
                      pageRows.map((need, i) => {
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
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white whitespace-nowrap capitalize"
                                style={{ backgroundColor: needCategoryColor(need.category) }}
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
              )}
            </PaginatedTable>
          </div>
          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
            Showing {data.recentNeeds.length} most recent needs submissions
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Breakdown (rendered when the API includes needs insights) ───────────────

type NeedsInsights = NonNullable<AnalyticsViewData<"community-needs">["needsInsights"]>;
type PieRow = { category: string; count: number; color: string };

function CategoryDonut({ pieData }: { pieData: PieRow[] }) {
  return (
    <ChartCard title="Needs by Category" description="Share of approved needs in each assessment category." icon={FileText}>
      {pieData.length === 0 ? <EmptyChart message="No approved needs yet." height={260} icon={ClipboardList} /> : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={pieData} dataKey="count" nameKey="category" cx="50%" cy="45%" innerRadius={55} outerRadius={88} paddingAngle={3}>
              {pieData.map((entry) => <Cell key={entry.category} fill={entry.color} />)}
            </Pie>
            <Tooltip {...tooltipProps} formatter={(v, name) => [`${Number(v)} needs`, String(name)]} />
            <Legend {...legendProps} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function NeedsKpis({ insights }: { insights: NeedsInsights }) {
  const totals = insights.totals;
  const criticalShare = totals.approved ? Math.round((totals.criticalOrHigh / totals.approved) * 100) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        { label: "Approved Needs",   value: totals.approved,                       sub: `${totals.submitted} submitted · ${totals.awaitingReview} awaiting review`, icon: FileText,     accent: "border-l-primary" },
        { label: "Critical or High", value: totals.criticalOrHigh,                 sub: `${criticalShare}% of approved needs`,                                     icon: AlertCircle,  accent: "border-l-danger" },
        { label: "Needs Addressed",  value: `${totals.addressedRate}%`,             sub: `${totals.addressed} of ${totals.approved} approved needs`,                icon: CheckCircle2, accent: "border-l-success" },
        { label: "People Affected",  value: totals.peopleAffected.toLocaleString(), sub: `across ${totals.barangaysReporting} barangays`,                             icon: Users,        accent: "border-l-info" },
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
  );
}

function NeedsCharts({ insights, pieData }: { insights: NeedsInsights; pieData: PieRow[] }) {
  const totals = insights.totals;

  const priorityData = insights.byPriority.map((row) => ({ ...row, label: PRIORITY_META[row.priority as keyof typeof PRIORITY_META]?.label ?? row.priority, color: PRIORITY_META[row.priority as keyof typeof PRIORITY_META]?.color ?? PALETTE.muted }));
  const reviewData = insights.review.map((row) => ({ ...row, label: REVIEW_META[row.stage]?.label ?? row.stage, color: REVIEW_META[row.stage]?.color ?? PALETTE.muted }));
  const barangayData = insights.byBarangay.map((row) => ({ ...row, name: shortLabel(row.barangay, 18) }));
  const monthlyHasData = insights.monthly.some((row) => row.total > 0);

  return (
    <>
      {/* ── Category, priority, review ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CategoryDonut pieData={pieData} />

        <ChartCard title="Needs by Priority" description="How urgent the approved needs are." icon={AlertCircle}>
          {totals.approved === 0 ? <EmptyChart message="No approved needs yet." height={260} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={priorityData} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} formatter={(v) => [`${Number(v)} needs`, "Approved"]} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {priorityData.map((entry) => <Cell key={entry.priority} fill={entry.color} />)}
                  <LabelList dataKey="count" position="top" style={{ fontSize: 12, fill: PALETTE.text }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Review Pipeline" description="Every submission by its Officer review decision." icon={ListChecks}>
          {totals.submitted === 0 ? <EmptyChart message="No needs submitted yet." height={260} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={reviewData} layout="vertical" margin={{ top: 5, right: 32, left: 8, bottom: 5 }}>
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={108} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} formatter={(v) => [`${Number(v)} needs`, "Submissions"]} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26}>
                  {reviewData.map((entry) => <Cell key={entry.stage} fill={entry.color} />)}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: PALETTE.text }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Trend ──────────────────────────────────────────────────────────── */}
      <ChartCard title="Needs Reported per Month" description="Approved needs by assessment month, stacked by priority." icon={CalendarDays}>
        {!monthlyHasData ? <EmptyChart message="No dated needs yet." height={260} icon={CalendarDays} /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={insights.monthly} margin={{ top: 5, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipProps} />
              <Legend {...legendProps} />
              {[...PRIORITY_KEYS].reverse().map((key, index) => (
                <Bar key={key} dataKey={key} name={PRIORITY_META[key].label} stackId="priority" fill={PRIORITY_META[key].color} maxBarSize={44} radius={index === PRIORITY_KEYS.length - 1 ? [4, 4, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── Progress and priority by category ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Response Progress by Category" description="Approved needs that are identified, being worked on, or addressed." icon={Gauge}>
          {insights.byCategory.length === 0 ? <EmptyChart message="No approved needs yet." /> : (
            <ResponsiveContainer width="100%" height={Math.max(200, insights.byCategory.length * 56)}>
              <BarChart data={insights.byCategory} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="category" width={100} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} />
                <Legend {...legendProps} />
                {(Object.keys(NEED_STATUS_META) as Array<keyof typeof NEED_STATUS_META>).map((key) => (
                  <Bar key={key} dataKey={key} name={NEED_STATUS_META[key].label} stackId="status" fill={NEED_STATUS_META[key].color} maxBarSize={28} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Priority Mix by Category" description="Which categories carry the most urgent needs." icon={Layers}>
          {insights.byCategory.length === 0 ? <EmptyChart message="No approved needs yet." /> : (
            <ResponsiveContainer width="100%" height={Math.max(200, insights.byCategory.length * 56)}>
              <BarChart data={insights.byCategory} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="category" width={100} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} />
                <Legend {...legendProps} />
                {PRIORITY_KEYS.map((key) => (
                  <Bar key={key} dataKey={key} name={PRIORITY_META[key].label} stackId="priority" fill={PRIORITY_META[key].color} maxBarSize={28} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Barangay gap and people affected ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Needs vs Programs per Barangay" description="Approved needs, needs addressed, and programs delivered — gaps show where response lags." icon={MapPin}>
          {barangayData.length === 0 ? <EmptyChart message="No barangay data yet." icon={MapPin} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barangayData} margin={{ top: 5, right: 16, left: -12, bottom: 5 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} labelFormatter={(label, payload) => payload?.[0]?.payload?.barangay ?? label} />
                <Legend {...legendProps} />
                <Bar dataKey="needs" name="Approved needs" fill={PALETTE.primary} radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="addressed" name="Needs addressed" fill={PALETTE.success} radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="programs" name="Programs" fill={PALETTE.accent} radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="People Affected by Category" description="Residents reported as affected, summed across approved needs." icon={Users}>
          {insights.byCategory.every((row) => row.people === 0) ? <EmptyChart message="No affected-people counts reported yet." icon={Users} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={insights.byCategory} layout="vertical" margin={{ top: 5, right: 48, left: 8, bottom: 5 }}>
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="category" width={100} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} formatter={(v) => [`${Number(v).toLocaleString()} people`, "Affected"]} />
                <Bar dataKey="people" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {insights.byCategory.map((entry, i) => <Cell key={entry.category} fill={needCategoryColor(entry.category, i)} />)}
                  <LabelList dataKey="people" position="right" style={{ fontSize: 12, fill: PALETTE.text }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </>
  );
}
