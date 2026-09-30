import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import {
  generateSnapshot, rangeContaining, previousPeriod,
} from "@/lib/analytics/snapshot";
import { NextResponse } from "next/server";
import { z } from "zod";
import { dashboardSummarySchema } from "@/lib/dashboard/contracts";
import { captureDashboardBaseline } from "@/lib/dashboard/kpi-trend";
import { retainDashboardBaseline } from "@/lib/analytics/retain-dashboard-baseline";

// POST /api/analytics/snapshots/generate
// Body: { period_type: "monthly" | "quarterly" | "yearly", scope?: "current" | "previous" }
//
// Officer-triggered ad-hoc snapshot. `scope`:
//   - "current"  → snapshot the in-progress period (default)
//   - "previous" → snapshot the most recently completed period (same as cron)
export async function POST(request: Request) {
  const auth = await authorizeCapability("analytics.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = z.object({ period_type: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"), scope: z.enum(["current", "previous"]).default("current") }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid snapshot request" }, { status: 400 });
  const body = parsed.data;
  const period = body.period_type;

  try {
  const range = body.scope === "previous"
    ? previousPeriod(period)
    : rangeContaining(period, new Date());

  const data  = await generateSnapshot(range);

  // Never backdate today's queue/stock values into a previous reporting period.
  // Only current monthly snapshots can start a future month-over-month baseline.
  if (period === "monthly" && body.scope !== "previous" && auth.actor.role === "paraya_officer") {
    const summary = await auth.supabase.rpc("phase7_get_dashboard_summary");
    if (summary.error) throw new Error("Current dashboard baseline is unavailable");
    const parsedSummary = dashboardSummarySchema.safeParse(summary.data);
    if (!parsedSummary.success || parsedSummary.data.role !== auth.actor.role) throw new Error("Invalid dashboard baseline");
    const baseline = captureDashboardBaseline(parsedSummary.data, range.start);
    if (baseline) data.dashboardKpis = baseline;
  }

  const admin = createAdminClient();
  await retainDashboardBaseline(admin, range, data);
  const { error } = await admin
    .from("analytics_snapshots")
    .upsert({
      period_type:  range.type,
      period_start: range.start,
      period_end:   range.end,
      data:         data as never,
      trigger:      "manual",
      generated_by: auth.actor.id,
    }, { onConflict: "period_type,period_start" });

  if (error) throw new Error("Snapshot could not be saved");

  return NextResponse.json({
    success: true,
    period:  range,
    summary: data.totals,
    dashboardBaselineRecorded: Boolean(data.dashboardKpis),
  });
  } catch {
    return NextResponse.json({ error: "Unable to generate a complete analytics snapshot" }, { status: 503 });
  }
}
