import type { createAdminClient } from "@/lib/supabase/admin";
import type { PeriodRange, SnapshotData } from "./snapshot";
import { dashboardBaselineSchema } from "@/lib/dashboard/kpi-trend";

/** Regenerating a period report must not backdate or erase an observed KPI baseline. */
export async function retainDashboardBaseline(
  admin: ReturnType<typeof createAdminClient>,
  range: PeriodRange,
  data: SnapshotData,
) {
  if (range.type !== "monthly" || data.dashboardKpis) return;
  const existing = await admin.from("analytics_snapshots").select("data")
    .eq("period_type", "monthly").eq("period_start", range.start).maybeSingle();
  if (existing.error) throw new Error("Snapshot history could not be checked");
  const stored = existing.data?.data as { dashboardKpis?: unknown } | null;
  const baseline = dashboardBaselineSchema.safeParse(stored?.dashboardKpis);
  if (baseline.success && new Date(baseline.data.capturedAt).toISOString().slice(0, 7) === range.start.slice(0, 7)) {
    data.dashboardKpis = baseline.data;
  }
}
