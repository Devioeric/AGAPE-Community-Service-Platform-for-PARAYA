import { NextResponse } from "next/server";
import { isFinanceIntegrityEnabled } from "@/lib/integrity/feature";
import { runFinanceIntegrityTick } from "@/lib/integrity/worker";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Worker authentication unavailable" }, { status: 503, headers });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isFinanceIntegrityEnabled()) return NextResponse.json({ data: { skipped: true, reason: "finance_integrity_disabled" } }, { headers });
  try {
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode !== null && mode !== "reconcile") return NextResponse.json({ error: "Invalid worker mode" }, { status: 400, headers });
    const data = await runFinanceIntegrityTick(createAdminClient(), mode === "reconcile");
    return NextResponse.json({ data }, { status: data.finalizeFailures ? 503 : 200, headers });
  } catch { return NextResponse.json({ error: "Finance integrity worker unavailable" }, { status: 503, headers }); }
}
export const GET = POST;
