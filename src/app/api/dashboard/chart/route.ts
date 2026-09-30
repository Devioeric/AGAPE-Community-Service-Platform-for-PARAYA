import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { dashboardChartViews, dashboardChartSchema, DASHBOARD_CHART_VIEWS, remoteChartViewSchema } from "@/lib/dashboard/chart-views";
import { DASHBOARD_CHART_QUERIES } from "@/lib/dashboard/chart-queries";
import { isPhase2ComponentEnabled } from "@/lib/phase2/feature";
import { financeChartPoints } from "@/lib/dashboard/finance-chart";
import { chartPeriod, chartRangeSchema } from "@/lib/dashboard/chart-period";
import { filteredChartPoints } from "@/lib/dashboard/filtered-chart";

const headers = { "Cache-Control": "private, no-store" };
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = remoteChartViewSchema.safeParse(params.get("view"));
  const range = chartRangeSchema.safeParse(params.get("range") ?? "all");
  if (!parsed.success || !range.success || Array.from(params.keys()).some(key => !["view", "range"].includes(key)) || params.getAll("view").length !== 1 || params.getAll("range").length > 1) return respond({ error: "Invalid chart view or date range" }, 400);
  const view = parsed.data;
  if ((view === "budgets" || view === "allocations") && params.has("range")) return respond({ error: "Date filtering is not available for Finance queue charts" }, 400);
  const auth = await authorizeCapability(DASHBOARD_CHART_VIEWS[view].capabilities[0]);
  if (!auth.ok) return respond({ error: auth.error }, auth.status);
  if (!dashboardChartViews(auth.actor).includes(view)) return respond({ error: "Chart unavailable for this account" }, 403);
  const component = view === "budgets" ? "proposals" : view === "allocations" ? "program_finance" : null;
  if (component && !isPhase2ComponentEnabled(component)) return respond({ data: { view, asOf: new Date().toISOString(), availability: "disabled" } });
  try {
    const now = new Date();
    const period = chartPeriod(range.data, now);
    const envelope = { view, asOf: now.toISOString(), ...(params.has("range") ? { range: range.data } : {}) };
    if (view === "hours" || view === "sdg") {
      const points = await filteredChartPoints(auth.supabase, view, period);
      return respond({ data: dashboardChartSchema.parse({ ...envelope, points }) });
    }
    if (view === "budgets" || view === "allocations") {
      const points = await financeChartPoints(auth.supabase, view);
      return respond({ data: dashboardChartSchema.parse({ view, asOf: new Date().toISOString(), points }) });
    }
    const definition = DASHBOARD_CHART_QUERIES[view];
    const points = await Promise.all(definition.buckets.map(async ([status, label]) => {
      let query = auth.supabase.from(definition.table).select("id", { head: true, count: "exact" }).eq(definition.field, status);
      if (view === "needs") query = query.eq("approval_status", "approved");
      if (period.timestampStart) query = query.gte("created_at", period.timestampStart).lt("created_at", period.timestampEnd!);
      const result = await query;
      if (result.error) throw result.error;
      if (typeof result.count !== "number" || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error("Invalid aggregate");
      return { label, value: result.count };
    }));
    return respond({ data: dashboardChartSchema.parse({ ...envelope, points }) });
  } catch (error) {
    const denied = error !== null && typeof error === "object" && "code" in error && error.code === "42501";
    return respond({ error: denied ? "Chart unavailable for this account" : "Chart data could not be loaded" }, denied ? 403 : 503);
  }
}
