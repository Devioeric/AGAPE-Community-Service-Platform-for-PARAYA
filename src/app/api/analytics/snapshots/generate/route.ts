import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import {
  generateSnapshot, rangeContaining, previousPeriod, type PeriodType,
} from "@/lib/analytics/snapshot";
import { NextResponse } from "next/server";

// POST /api/analytics/snapshots/generate
// Body: { period_type: "monthly" | "quarterly" | "yearly", scope?: "current" | "previous" }
//
// Officer-triggered ad-hoc snapshot. `scope`:
//   - "current"  → snapshot the in-progress period (default)
//   - "previous" → snapshot the most recently completed period (same as cron)
export async function POST(request: Request) {
  const auth = await authorizeCapability("analytics.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json() as {
    period_type?: PeriodType;
    scope?:       "current" | "previous";
  };

  const period = body.period_type ?? "monthly";
  if (!["monthly", "quarterly", "yearly"].includes(period)) {
    return NextResponse.json({ error: "Invalid period_type" }, { status: 400 });
  }

  const range = body.scope === "previous"
    ? previousPeriod(period)
    : rangeContaining(period, new Date());

  const data  = await generateSnapshot(range);

  const admin = createAdminClient();
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    period:  range,
    summary: data.totals,
  });
}
