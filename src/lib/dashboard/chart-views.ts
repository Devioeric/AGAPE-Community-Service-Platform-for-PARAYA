import { z } from "zod";
import { hasCapability, type Capability, type PermissionOverrides } from "@/lib/auth/capabilities";
import type { AnalyticsViewData } from "@/lib/analytics/view-contract";
import { isFocusSdg } from "@/lib/sdg-focus.js";
import { chartRangeSchema } from "./chart-period";

const officers = ["paraya_officer"];
export const DASHBOARD_CHART_VIEWS = {
  hours: { label: "Volunteer Hours", title: "Volunteer Hours — Last 6 Months", description: "Approved service hours by month", unit: "Hours", roles: officers, capabilities: ["analytics.aggregate.read", "activity_log.manage"] },
  programs: { label: "Programs", title: "Programs by Status", description: "Accessible programs by current status, including cancelled programs", unit: "Programs", roles: officers, capabilities: ["analytics.aggregate.read", "program.read"] },
  proposals: { label: "Proposals", title: "Proposals by Status", description: "Accessible proposals by current status; this is not a monthly trend", unit: "Proposals", roles: officers, capabilities: ["analytics.aggregate.read", "proposal.read"] },
  needs: { label: "Community Needs", title: "Approved Community Needs", description: "Approved needs by response status; pending and rejected needs are excluded", unit: "Needs", roles: officers, capabilities: ["analytics.aggregate.read", "community_need.read"] },
  sdg: { label: "SDGs", title: "SDG Alignment", description: "Proposal-to-SDG alignments; a proposal can contribute to more than one SDG", unit: "Alignments", roles: officers, capabilities: ["analytics.aggregate.read", "proposal.read"] },
  budgets: { label: "Proposal Budgets", title: "Finance Proposal Budgets", description: "Current budgets in the authorized Finance proposal queue — counts, not pesos", unit: "Budgets", roles: ["finance_officer"], capabilities: ["budget.read", "budget.review"] },
  allocations: { label: "Program Allocations", title: "Program Allocation Status", description: "Latest allocation status per program in the authorized Finance queue — counts, not pesos", unit: "Programs", roles: ["finance_officer"], capabilities: ["budget.read"] },
} satisfies Record<string, { label: string; title: string; description: string; unit: string; roles: string[]; capabilities: Capability[] }>;
export type DashboardChartView = keyof typeof DASHBOARD_CHART_VIEWS;
export type ChartActor = { role: string; permissions: PermissionOverrides };

export function dashboardChartViews(actor: ChartActor): DashboardChartView[] {
  const allowed = (Object.keys(DASHBOARD_CHART_VIEWS) as DashboardChartView[]).filter(key => {
    const view = DASHBOARD_CHART_VIEWS[key];
    return view.roles.includes(actor.role) && view.capabilities.every(capability => hasCapability(actor.role, actor.permissions, capability));
  });
  return actor.role === "paraya_officer" && allowed.includes("needs")
    ? ["needs", ...allowed.filter(key => key !== "needs")] : allowed;
}

export function selectedChartView(allowed: DashboardChartView[], requested: string | null): DashboardChartView | null {
  return allowed.find(key => key === requested) ?? allowed[0] ?? null;
}

export const remoteChartViewSchema = z.enum(["hours", "sdg", "programs", "proposals", "needs", "budgets", "allocations"]);
export type RemoteChartView = z.infer<typeof remoteChartViewSchema>;
const point = z.object({ label: z.string().min(1).max(80), value: z.number().finite().nonnegative() }).strict();
const readyChartSchema = z.object({
  view: remoteChartViewSchema,
  range: chartRangeSchema.optional(),
  asOf: z.string().datetime({ offset: true }),
  points: z.array(point).max(32),
}).strict().superRefine((data, context) => {
  if (new Set(data.points.map(point => point.label)).size !== data.points.length) context.addIssue({ code: "custom", message: "Duplicate chart category" });
});
export const dashboardChartSchema = z.union([
  readyChartSchema,
  z.object({ view: remoteChartViewSchema, asOf: z.string().datetime({ offset: true }), availability: z.literal("disabled") }).strict(),
]);
export const parseDashboardChart = (data: unknown) => dashboardChartSchema.parse(data);
export type DashboardChartPoint = z.infer<typeof point>;

/** Existing dashboard aggregates are shared with the other panels, without another request. */
export function dashboardAnalyticsPoints(view: "hours" | "sdg", data: AnalyticsViewData<"dashboard">): DashboardChartPoint[] {
  return view === "hours" ? data.hours.byMonth.map(row => ({ label: row.month, value: row.hours }))
    : data.sdg.counts.filter(row => isFocusSdg(row.sdg)).map(row => ({ label: `SDG ${row.sdg}`, value: row.count }));
}
