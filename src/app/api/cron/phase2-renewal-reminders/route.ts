import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPhase2ComponentEnabled } from "@/lib/phase2/feature";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPhase2ComponentEnabled("partners")) return NextResponse.json({ data: { skipped: true, reason: "partner_registry_disabled" } });
  const { data, error } = await createAdminClient().rpc("phase2_generate_renewal_reminders");
  if (error) return NextResponse.json({ error: "Unable to generate renewal reminders" }, { status: 500 });
  return NextResponse.json({ data: { deliveriesCreated: data } });
}
export const GET = POST;
