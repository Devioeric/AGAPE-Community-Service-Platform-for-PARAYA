import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";

// GET /api/analytics/snapshots
// Lists saved snapshots (most recent first). Officer/admin only.
export async function GET(request: Request) {
  const auth = await authorizeCapability("analytics.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url    = new URL(request.url);
  const period = url.searchParams.get("period_type");

  const admin = createAdminClient();
  let query = admin
    .from("analytics_snapshots")
    .select("id, period_type, period_start, period_end, data, trigger, created_at, generated_by")
    .order("period_start", { ascending: false })
    .limit(100);

  if (period && ["monthly", "quarterly", "yearly"].includes(period)) {
    query = query.eq("period_type", period);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
