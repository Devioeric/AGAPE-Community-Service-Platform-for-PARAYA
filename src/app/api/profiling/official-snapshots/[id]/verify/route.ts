import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_verify_official_population_snapshot", { p_snapshot_id: id });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}
