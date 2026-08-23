import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";
import { enforceAggregateComplementarySuppression } from "@/lib/profiling/privacy";
import type { ProfilingAggregateDTO } from "@/types/profiling";

export async function GET(_request: Request, { params }: { params: Promise<{ cycleId: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { cycleId } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_profiling_aggregate", { p_cycle_id: cycleId });
  if (error) return profilingRpcError(error);
  try {
    return NextResponse.json({ data: enforceAggregateComplementarySuppression(data as ProfilingAggregateDTO) });
  } catch {
    return NextResponse.json({ error: "Aggregate privacy contract validation failed" }, { status: 500 });
  }
}
