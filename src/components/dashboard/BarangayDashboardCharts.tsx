"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useReadResource } from "@/components/shared/useReadResource";
import { ReadResourceState } from "@/components/shared/ReadResourceState";
import {
  barangayChartViews, parseBarangayChart, BARANGAY_CHART_VIEWS, type BarangayChartRange, type BarangayChartView,
} from "@/lib/dashboard/barangay-charts";
import type { PermissionOverrides } from "@/lib/auth/capabilities";

const RANGE_LABEL: Record<BarangayChartRange, string> = { recent: "Last 6 months", month: "This month", year: "This year", all: "All time" };

/**
 * The Secretary's dashboard charts, styled like the Officer chart card. Every
 * view is counted by /api/barangay/charts for the Secretary's own barangay.
 */
export function BarangayDashboardCharts({ actor, className }: { actor: { role: string; permissions: PermissionOverrides }; className?: string }) {
  const allowed = barangayChartViews(actor);
  const [requested, setRequested] = useState<BarangayChartView | null>(null);
  const [ranges, setRanges] = useState<Partial<Record<BarangayChartView, BarangayChartRange>>>({});
  const view = allowed.find((key) => key === requested) ?? allowed[0] ?? null;
  const range: BarangayChartRange = (view && ranges[view]) ?? (view === "hours" ? "recent" : "all");
  const resource = useReadResource(view ? `/api/barangay/charts?view=${view}&range=${range}` : null, parseBarangayChart);
  if (!view) return null;

  const definition = BARANGAY_CHART_VIEWS[view];
  // A valid response for another view or range is still a contract failure.
  const status = resource.data && (resource.data.view !== view || resource.data.range !== range) ? "error" : resource.status;
  const points = status === "success" && resource.data ? resource.data.points : [];
  const hasValues = points.some((point) => point.value > 0);
  const periodNote = view === "hours"
    ? range === "recent" ? "Last six months, by month" : range === "month" ? "This month, by day" : range === "year" ? "This year, by month" : "All time, by year"
    : `Record creation dates: ${RANGE_LABEL[range].toLowerCase()} (Philippine time). Statuses reflect their current state`;

  return <Card className={`min-w-0 border-border shadow-card ${className ?? ""}`} data-testid="barangay-dashboard-charts">
    <CardContent className="min-w-0 px-6 pb-4">
      <Tabs value={view} onValueChange={(value) => setRequested(String(value) as BarangayChartView)} className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-1 border-b border-border/40 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 max-w-full overflow-x-auto px-1">
            <TabsList variant="line" aria-label="Barangay chart views" className="min-w-max justify-start gap-5 p-0 group-data-horizontal/tabs:h-11">
              {allowed.map((key) => <TabsTrigger key={key} value={key} className="h-11 flex-none rounded-none border-0 px-0 py-3 text-xs font-normal text-muted-foreground after:hidden data-[active]:font-semibold data-[active]:text-foreground focus-visible:ring-inset">
                {BARANGAY_CHART_VIEWS[key].label}
                {key === view && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
              </TabsTrigger>)}
            </TabsList>
          </div>
          <label className="flex shrink-0 items-center gap-1 self-end pb-1 text-xs text-muted-foreground sm:self-auto sm:pb-0">
            <span aria-hidden="true" className="text-[12px]">Period</span>
            <span className="relative">
              <select aria-label="Chart date range" value={range} onChange={(event) => setRanges((current) => ({ ...current, [view]: event.target.value as BarangayChartRange }))} className="h-10 cursor-pointer appearance-none rounded-sm border-0 bg-transparent py-2 pl-1 pr-5 text-xs font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset [&>option]:bg-background [&>option]:text-foreground">
                {view === "hours" && <option value="recent">{RANGE_LABEL.recent}</option>}
                <option value="month">{RANGE_LABEL.month}</option><option value="year">{RANGE_LABEL.year}</option><option value="all">{RANGE_LABEL.all}</option>
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>
        </div>
        {allowed.map((key) => <TabsContent key={key} value={key}>
          {key === view && <div className="min-w-0" aria-busy={status === "loading"}>
            {status === "success" && <>
              <h3 className="text-sm font-medium text-foreground">{definition.title}</h3>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">{definition.description}. {periodNote}.</p>
            </>}
            <ReadResourceState status={status} label={definition.label} retry={resource.reload} />
            {status === "denied" && <p className="py-8 text-sm text-muted-foreground">You no longer have access to this chart view.</p>}
            {status === "success" && (!hasValues ? <p className="py-8 text-sm text-muted-foreground">No data to display for this view.</p> : <>
              <div className="overflow-x-auto" data-testid="barangay-chart-plot">
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
              <table className="sr-only"><caption>{definition.title}</caption><thead><tr><th>Category</th><th>{definition.unit}</th></tr></thead>
                <tbody>{points.map((point) => <tr key={point.label}><td>{point.label}</td><td>{point.value.toLocaleString()}</td></tr>)}</tbody>
              </table>
            </>)}
          </div>}
        </TabsContent>)}
      </Tabs>
    </CardContent>
  </Card>;
}
