import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateSnapshot, previousPeriod, type PeriodType,
} from "@/lib/analytics/snapshot";
import { NextResponse } from "next/server";

// POST /api/cron/snapshot?period=monthly|quarterly|yearly
//
// Auth: `Authorization: Bearer <CRON_SECRET>` — Vercel Cron sends this header
// automatically when the CRON_SECRET env var is set on the project.
//
// Generates a snapshot for the most recently *completed* period (e.g., on
// May 1, it snapshots April). UPSERT on (period_type, period_start) so the
// endpoint is idempotent — multiple runs in the same window overwrite.

const VALID_PERIODS: PeriodType[] = ["monthly", "quarterly", "yearly"];

export async function POST(request: Request) {
  // ── Auth: cron secret ──────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this deployment." },
      { status: 503 }
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url     = new URL(request.url);
  const period  = (url.searchParams.get("period") ?? "monthly") as PeriodType;
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  // Snapshot the most recently completed period
  const range = previousPeriod(period);
  const data  = await generateSnapshot(range);

  const admin = createAdminClient();
  const { error } = await admin
    .from("analytics_snapshots")
    .upsert({
      period_type:  range.type,
      period_start: range.start,
      period_end:   range.end,
      data:         data as never,
      trigger:      "cron",
    }, { onConflict: "period_type,period_start" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    period:  range,
    summary: data.totals,
  });
}

// Vercel Cron sends GET to the configured path. Mirror POST for convenience
// so the same endpoint works either way.
export const GET = POST;
