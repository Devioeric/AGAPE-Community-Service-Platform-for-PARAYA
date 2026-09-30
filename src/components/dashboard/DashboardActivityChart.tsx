"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useReadResource } from "@/components/shared/useReadResource";
import { ReadResourceState } from "@/components/shared/ReadResourceState";
import { dashboardChartViews, selectedChartView, dashboardAnalyticsPoints, parseDashboardChart, DASHBOARD_CHART_VIEWS, type ChartActor, type DashboardChartPoint } from "@/lib/dashboard/chart-views";
import type { AnalyticsViewData } from "@/lib/analytics/view-contract";
import type { ReadStatus } from "@/lib/read-resource";
import type { ChartRange } from "@/lib/dashboard/chart-period";

type Props = {
  actor: ChartActor;
  analytics: { status: ReadStatus; data: AnalyticsViewData<"dashboard"> | null; reload: () => unknown };
  className?: string;
};

export function DashboardActivityChart({ actor, analytics, className }: Props) {
  // Reset the selection/resource when the account or permission set changes.
  const identity = JSON.stringify([actor.role, Object.entries(actor.permissions ?? {}).sort()]);
  return <ChartWorkspace key={identity} actor={actor} analytics={analytics} className={className} />;
}

function ChartWorkspace({ actor, analytics, className }: Props) {
  const allowed = dashboardChartViews(actor);
  const [requested, setRequested] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange | null>(null);
  const view = selectedChartView(allowed, requested);
  const supportsRange = view !== "budgets" && view !== "allocations";
  const shared = (view === "hours" || view === "sdg") && range === null;
  const remote = useReadResource(view && !shared ? `/api/dashboard/chart?view=${view}${supportsRange && range ? `&range=${range}` : ""}` : null, parseDashboardChart);
  if (!view) return null;
  const definition = DASHBOARD_CHART_VIEWS[view];
  let status = shared ? analytics.status : remote.status;
  // A valid response for the wrong view is still a contract failure.
  if (!shared && remote.data && (remote.data.view !== view || (range && supportsRange && (!("range" in remote.data) || remote.data.range !== range)))) status = "error";
  const disabled = !shared && remote.data && "availability" in remote.data && remote.data.availability === "disabled";
  const points: DashboardChartPoint[] = shared && analytics.data
    ? dashboardAnalyticsPoints(view as "hours" | "sdg", analytics.data)
    : !shared && remote.data?.view === view && "points" in remote.data ? remote.data.points : [];
  const retry = shared ? analytics.reload : remote.reload;
  const hasValues = points.some(point => point.value > 0);
  const rangeLabel = range === "month" ? "This month" : range === "year" ? "This year" : "All time";
  const title = view === "hours" && range ? `Volunteer Hours — ${rangeLabel}` : definition.title;
  const periodDescription = !supportsRange ? "" : view === "hours"
    ? range ? `Approved service hours by ${range === "month" ? "day" : range === "year" ? "month" : "year"}; Philippine calendar dates.` : ""
    : `${view === "sdg" ? "Proposal creation" : "Record creation"} dates: ${rangeLabel.toLowerCase()} (Philippine time). Statuses reflect their current state.`;

  return <Card className={`min-w-0 border-border shadow-card ${className ?? ""}`} data-testid="dashboard-activity-chart">
    <CardContent className="min-w-0 px-6 pb-4">
      <Tabs value={view} onValueChange={value => setRequested(String(value))} className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-1 border-b border-border/40 sm:flex-row sm:items-center sm:justify-between sm:gap-4" data-testid="dashboard-chart-toolbar">
        <div className="min-w-0 max-w-full overflow-x-auto px-1">
          <TabsList variant="line" aria-label="Dashboard chart views" className="min-w-max justify-start gap-5 p-0 group-data-horizontal/tabs:h-11">
            {allowed.map(key => <TabsTrigger key={key} value={key} className="h-11 flex-none rounded-none border-0 px-0 py-3 text-xs font-normal text-muted-foreground after:hidden data-[active]:font-semibold data-[active]:text-foreground focus-visible:ring-inset">
              {DASHBOARD_CHART_VIEWS[key].label}
              {key === view && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" data-testid="dashboard-chart-active-underline" />}
            </TabsTrigger>)}
          </TabsList>
        </div>
        {supportsRange && <label className="flex shrink-0 items-center gap-1 self-end pb-1 text-xs text-muted-foreground sm:self-auto sm:pb-0">
          <span className="sr-only">Chart date range</span>
          <span aria-hidden="true" className="text-[12px]">Period</span>
          <span className="relative">
          <select aria-label="Chart date range" value={range ?? (view === "hours" ? "recent" : "all")} onChange={event => setRange(event.target.value === "recent" ? null : event.target.value as ChartRange)} className="h-10 cursor-pointer appearance-none rounded-sm border-0 bg-transparent py-2 pl-1 pr-5 text-xs font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset [&>option]:bg-background [&>option]:text-foreground">
            {view === "hours" && <option value="recent">Last 6 months</option>}
            <option value="month">This month</option><option value="year">This year</option><option value="all">All time</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          </span>
        </label>}
        </div>
        {allowed.map(key => <TabsContent key={key} value={key}>
          {key === view && <div className="min-w-0" aria-busy={status === "loading"}>
            {status === "success" && <>
              <h3 className="text-sm font-medium text-foreground">{title}</h3>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">{view === "hours" && range ? periodDescription : `${definition.description}${periodDescription ? `. ${periodDescription}` : ""}`}</p>
            </>}
            <ReadResourceState status={status} label={definition.label} retry={retry} />
            {status === "denied" && <p className="py-8 text-sm text-muted-foreground">You no longer have access to this chart view.</p>}
            {status === "success" && disabled && <p className="py-8 text-sm text-muted-foreground">This chart will be available when its Finance module is enabled.</p>}
            {status === "success" && !disabled && (!hasValues ? <p className="py-8 text-sm text-muted-foreground">No data to display for this view.</p> : <>
              <div className="overflow-x-auto" data-testid="dashboard-chart-plot">
                <div style={{ minWidth: Math.max(280, points.length * 65) }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={points} barSize={28} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={view === "hours"} tick={{ fontSize: 12, fill: "#6B6356" }} axisLine={false} tickLine={false} width={45} />
                      <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E5DDD0", borderRadius: 8, fontSize: 13 }} cursor={{ fill: "rgba(107,91,62,0.05)" }} />
                      <Bar dataKey="value" name={definition.unit} fill="#6B5B3E" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <table className="sr-only"><caption>{title}</caption><thead><tr><th>Category</th><th>{definition.unit}</th></tr></thead>
                <tbody>{points.map(point => <tr key={point.label}><td>{point.label}</td><td>{point.value.toLocaleString()}</td></tr>)}</tbody>
              </table>
            </>)}
          </div>}
        </TabsContent>)}
      </Tabs>
    </CardContent>
  </Card>;
}
