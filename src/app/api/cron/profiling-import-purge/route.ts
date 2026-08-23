import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { requireCronAuth } from "@/lib/cron-auth";

export async function POST(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  if (!isProfilingV2Enabled()) return NextResponse.json({ data: { skipped: true, reason: "profiling_disabled" } });
  const { data, error } = await createAdminClient().rpc("phase1_purge_expired_import_staging");
  if (error) return NextResponse.json({ error: "Unable to purge expired profiling staging data" }, { status: 500 });
  return NextResponse.json({ data: { purged_rows: data } });
}

export const GET = POST;
