import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeAnyCapability(["profiling.collect", "profiling.validate", "profiling.detail.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_get_profiling_submission", { p_submission_id: id });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}

export async function DELETE() {
  return NextResponse.json({ error: "Profiling records use lifecycle corrections and cannot be deleted" }, { status: 405, headers: { Allow: "GET" } });
}
