import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.collect");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_get_import_batch", { p_batch_id: id });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.collect");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_commit_profiling_import", { p_batch_id: id });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { committed_packages: data } });
}
