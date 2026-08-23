import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

export async function GET(request: Request) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeAnyCapability(["profiling.validate", "profiling.cycle.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const cycleId = new URL(request.url).searchParams.get("cycle_id");
  if (!cycleId) return NextResponse.json({ error: "cycle_id is required" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_list_profiling_duplicates", { p_cycle_id: cycleId });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}
