"use client";

import { PaginatedTable } from "@/components/shared/PaginatedTable";

import { useAnalyticsView } from "@/lib/analytics/use-analytics-view";
import {
  Loader2, TrendingUp, GitBranch, Wallet, LineChart as LineChartIcon, Users, MapPin, Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SDG_PRESENTATION as SDG_META, SDG_NUMBERS } from "@/lib/analytics/sdg-presentation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, LabelList,
} from "recharts";
import { ChartCard, EmptyChart, PALETTE, STAGE_META, axisTick, gridProps, legendProps, peso, shortLabel, tooltipProps } from "@/components/analytics/chart-kit";

const STAGE_KEYS = ["approved", "in_review", "revisions", "draft", "rejected"] as const;
const sdgName = (label: unknown) => {
  const number = Number(String(label).replace(/\D/g, ""));
  return SDG_META[number] ? `SDG ${number} · ${SDG_META[number].label}` : String(label);
};

// ─── Types ──────────────────────────────────────────────────────────────────



// ─── Constants ──────────────────────────────────────────────────────────────

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
  const { data, loading, error, denied, retry } = useAnalyticsView("sdg");

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
        <p className="text-sm">{denied ? "You do not have access to this analytics view." : "Analytics data is temporarily unavailable."}</p>
        {!denied && <button onClick={retry} className="rounded border border-border px-4 py-2 focus-visible:ring-2 focus-visible:ring-primary">Retry</button>}
      </div>
    );
  }

  const sdgCounts = SDG_NUMBERS.reduce<Record<number, number>>((acc, n) => {
    acc[n] = data.sdg.counts.find((c) => c.sdg === n)?.count ?? 0;
    return acc;
  }, {});

  const chartData = SDG_NUMBERS.map((n) => ({
    sdg:   `SDG ${n}`,
    count: sdgCounts[n],
    color: SDG_META[n].color,
  }));

  const totalAligned = Object.values(sdgCounts).reduce((s, c) => s + c, 0);

  const insights = data.sdgInsights;
  const label = <T extends { sdg: number }>(row: T) => ({ ...row, name: `SDG ${row.sdg}` });
  const stageData = (insights?.byStage ?? []).map(label);
  const investmentData = (insights?.investment ?? []).map(label);
  const deliveryData = (insights?.delivery ?? []).map(label);
  const hasInvestment = investmentData.some((row) => row.requested > 0);
  const hasDelivery = deliveryData.some((row) => row.programs > 0 || row.outcomes > 0);
  const barangayData = (insights?.byBarangay ?? []).map((row) => ({ ...row, name: shortLabel(String(row.barangay), 18) }));

  return (
    <div className="space-y-8 animate-fade-in">


      {/* ── SDG Breakdown Cards ─────────────────────────────────────────────── */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground mb-4">SDG Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SDG_NUMBERS.map((n) => {
            const meta  = SDG_META[n];
            const count = sdgCounts[n];
            const pct   = data.proposals.total ? Math.round(count / data.proposals.total * 100) : 0;
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
                      <TrendingUp className="w-4 h-4" style={{ color: meta.color }} />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-tight">{meta.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                    Recorded proposal alignment
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-2xl font-bold font-heading text-foreground">{count}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">aligned proposals</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-heading text-foreground">
                        {pct}%
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-tight">of recorded proposals</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground">Share of recorded proposals</span>
                      <span className="text-[11px] font-semibold text-foreground">{pct}%</span>
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
                  tick={{ fontSize: 13, fill: "#6B6356", fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#6B6356" }}
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

      {insights && (<>
      {/* ── Pipeline and investment per SDG ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="From Proposal to Approval" description="Aligned proposals per SDG by where they are in the review pipeline." icon={GitBranch}>
          {totalAligned === 0 ? <EmptyChart message="No SDG-aligned proposals yet." icon={GitBranch} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stageData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="name" tick={{ ...axisTick, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} labelFormatter={sdgName} />
                <Legend {...legendProps} />
                {STAGE_KEYS.map((key) => (
                  <Bar key={key} dataKey={key} name={STAGE_META[key].label} stackId="stage" fill={STAGE_META[key].color} maxBarSize={56} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Budget per SDG" description="Proposal budgets requested and approved per SDG. A proposal aligned to several SDGs counts toward each." icon={Wallet}>
          {!hasInvestment ? <EmptyChart message="No proposal budgets recorded yet." icon={Wallet} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={investmentData} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="name" tick={{ ...axisTick, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => peso(Number(v), true)} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} labelFormatter={sdgName} formatter={(v, name) => [peso(Number(v)), String(name)]} />
                <Legend {...legendProps} />
                <Bar dataKey="requested" name="Requested" fill={PALETTE.accent} radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="approved" name="Approved" fill={PALETTE.success} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Trend and reach ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="SDG Alignment Trend" description="New SDG-aligned proposals per quarter, by goal." icon={LineChartIcon} className="lg:col-span-2">
          {insights.quarterly.length === 0 ? <EmptyChart message="No dated SDG-aligned proposals yet." icon={LineChartIcon} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={insights.quarterly} margin={{ top: 5, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="quarter" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} />
                <Legend {...legendProps} />
                {SDG_NUMBERS.map((n) => (
                  <Bar key={n} dataKey={`sdg${n}`} name={`SDG ${n}`} fill={SDG_META[n].color} radius={[3, 3, 0, 0]} maxBarSize={18} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Expected Beneficiaries" description="People the aligned proposals plan to reach, per SDG." icon={Users}>
          {!investmentData.some((row) => row.beneficiaries > 0) ? <EmptyChart message="No beneficiary targets recorded yet." icon={Users} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={investmentData} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="name" tick={{ ...axisTick, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} labelFormatter={sdgName} formatter={(v) => [`${Number(v).toLocaleString()} people`, "Expected"]} />
                <Bar dataKey="beneficiaries" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {investmentData.map((row) => <Cell key={row.sdg} fill={SDG_META[row.sdg]?.color ?? PALETTE.muted} />)}
                  <LabelList dataKey="beneficiaries" position="top" style={{ fontSize: 12, fill: PALETTE.text }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="SDG Reach by Barangay" description="Proposal alignments per barangay, stacked by goal." icon={MapPin}>
          {barangayData.length === 0 ? <EmptyChart message="No SDG-aligned proposals yet." icon={MapPin} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barangayData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} labelFormatter={(value, payload) => payload?.[0]?.payload?.barangay ?? value} />
                <Legend {...legendProps} />
                {SDG_NUMBERS.map((n) => (
                  <Bar key={n} dataKey={`sdg${n}`} name={`SDG ${n}`} stackId="sdg" fill={SDG_META[n].color} maxBarSize={56} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Programs and Recorded Outcomes" description="Programs tagged with each SDG, and the outcomes recorded against them." icon={Target}>
          {!hasDelivery ? <EmptyChart message="No programs tagged with SDGs yet." icon={Target} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={deliveryData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="name" tick={{ ...axisTick, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} labelFormatter={sdgName} />
                <Legend {...legendProps} />
                <Bar dataKey="programs" name="Programs" fill={PALETTE.primary} radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="outcomes" name="Outcomes recorded" fill={PALETTE.success} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      </>)}

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
            <PaginatedTable rows={data.proposalRows} label="SDG proposals">
              {(pageRows) => (
                <table aria-label="SDG proposals" className="w-full text-sm">
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
                      pageRows.map((row, i) => (
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
                                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-white"
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
              )}
            </PaginatedTable>
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
