import { NextResponse } from "next/server";
import { isPhase2ComponentEnabled } from "@/lib/phase2/feature";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPhase2ComponentEnabled("historical_programs")) return NextResponse.json({ data: { skipped: true, reason: "historical_programs_disabled" } });
  const { data, error } = await createAdminClient().rpc("phase2_purge_historical_imports");
  if (error) return NextResponse.json({ error: "Unable to purge expired historical staging data" }, { status: 500 });
  return NextResponse.json({ data: { purgedRows: data } });
}
export const GET = POST;
