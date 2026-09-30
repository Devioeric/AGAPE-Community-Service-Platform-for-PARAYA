import { z } from "zod";
import { hasCapability, type Capability, type PermissionOverrides } from "@/lib/auth/capabilities";
import { chartHourPoints, chartPeriod, type ChartRange } from "./chart-period";

// Dashboard charts for the Barangay Secretary. Every view counts records of the
// Secretary's own barangay only; the route applies that scope on the server.

export const BARANGAY_CHART_VIEWS = {
  needs: { label: "Community Needs", title: "Community Needs by Review Status", description: "Needs your barangay submitted, by PARAYA review status", unit: "Needs", any: ["community_need.submit", "community_need.read"] },
  categories: { label: "Need Categories", title: "Approved Needs by Category", description: "Approved community needs of your barangay, by category", unit: "Needs", any: ["community_need.read", "community_need.submit"] },
  programs: { label: "Programs", title: "Programs by Status", description: "Programs in your barangay, by current status", unit: "Programs", any: ["report.read"] },
  hours: { label: "Volunteer Hours", title: "Volunteer Hours", description: "Approved volunteer service hours in your barangay's programs", unit: "Hours", any: ["report.read"] },
} satisfies Record<string, { label: string; title: string; description: string; unit: string; any: Capability[] }>;

export type BarangayChartView = keyof typeof BARANGAY_CHART_VIEWS;
export const barangayChartViewSchema = z.enum(["needs", "categories", "programs", "hours"]);
/** "recent" is the last six months, the default for volunteer hours. */
export const barangayChartRangeSchema = z.enum(["recent", "month", "year", "all"]);
export type BarangayChartRange = z.infer<typeof barangayChartRangeSchema>;

export function barangayChartViews(actor: { role: string; permissions: PermissionOverrides }): BarangayChartView[] {
  if (actor.role !== "barangay_secretary") return [];
  return (Object.keys(BARANGAY_CHART_VIEWS) as BarangayChartView[])
    .filter((key) => BARANGAY_CHART_VIEWS[key].any.some((capability) => hasCapability(actor.role, actor.permissions, capability)));
}

/** Bucket order and labels; unknown values are ignored rather than shown. */
export const BARANGAY_CHART_BUCKETS: Record<Exclude<BarangayChartView, "hours">, ReadonlyArray<readonly [string, string]>> = {
  needs: [["pending_paraya_review", "Awaiting review"], ["needs_revision", "Needs revision"], ["approved", "Approved"], ["rejected", "Rejected"]],
  categories: [["health", "Health"], ["livelihood", "Livelihood"], ["education", "Education"], ["infrastructure", "Infrastructure"], ["environment", "Environment"]],
  programs: [["draft", "Draft"], ["planning", "Planning"], ["upcoming", "Upcoming"], ["active", "Active"], ["completed", "Completed"], ["cancelled", "Cancelled"]],
};

const point = z.object({ label: z.string().min(1).max(80), value: z.number().finite().nonnegative() }).strict();
export const barangayChartSchema = z.object({
  view: barangayChartViewSchema,
  range: barangayChartRangeSchema,
  asOf: z.string().datetime({ offset: true }),
  points: z.array(point).max(32),
}).strict().superRefine((data, context) => {
  if (new Set(data.points.map((row) => row.label)).size !== data.points.length) context.addIssue({ code: "custom", message: "Duplicate chart category" });
});
export type BarangayChart = z.infer<typeof barangayChartSchema>;
export const parseBarangayChart = (data: unknown) => barangayChartSchema.parse(data);

export function countBuckets(view: Exclude<BarangayChartView, "hours">, values: ReadonlyArray<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value.toLowerCase(), (counts.get(value.toLowerCase()) ?? 0) + 1);
  return BARANGAY_CHART_BUCKETS[view].map(([key, label]) => ({ label, value: counts.get(key) ?? 0 }));
}

/** Created-at window for the status views, in Philippine time; "recent" means the last six months. */
export function barangayChartWindow(range: BarangayChartRange, now = new Date()): { start: string | null; end: string | null } {
  if (range === "recent") {
    const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 5, 1));
    return { start: new Date(start.getTime() - 8 * 60 * 60 * 1000).toISOString(), end: null };
  }
  const period = chartPeriod(range, now);
  return { start: period.timestampStart, end: period.timestampEnd };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Approved hours: the last six months by month, or the shared month/year/all-time grouping. */
export function barangayHourPoints(rows: ReadonlyArray<{ date: string; hours: number }>, range: BarangayChartRange, now = new Date()) {
  if (range !== "recent") return chartHourPoints(rows, chartPeriod(range as ChartRange, now));
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const keys: string[] = [];
  for (let offset = 5; offset >= 0; offset--) {
    const month = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - offset, 1));
    keys.push(month.toISOString().slice(0, 7));
  }
  const totals = new Map(keys.map((key) => [key, 0]));
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    if (totals.has(key) && Number.isFinite(row.hours)) totals.set(key, (totals.get(key) ?? 0) + row.hours);
  }
  return keys.map((key) => ({ label: `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`, value: Math.round((totals.get(key) ?? 0) * 10) / 10 }));
}
