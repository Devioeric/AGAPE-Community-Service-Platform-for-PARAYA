import { NextResponse } from "next/server";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";
import { parseProfilingPackage } from "@/lib/profiling/contracts";
import { getAuthorizedProfilingCycleContext, getProfilingSubmissionMutationDTO } from "@/lib/profiling/server-context";

export async function GET(request: Request) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeAnyCapability(["profiling.collect", "profiling.validate", "profiling.detail.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const cycleId = new URL(request.url).searchParams.get("cycle_id");
  if (!cycleId) return NextResponse.json({ error: "cycle_id is required" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_list_profiling_submissions", { p_cycle_id: cycleId });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.collect");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const raw = await request.json().catch(() => null);
  const cycleId = raw && typeof raw === "object" ? String((raw as Record<string, unknown>).cycle_id ?? "") : "";
  let cycle;
  try { cycle = await getAuthorizedProfilingCycleContext(auth.supabase, cycleId); }
  catch (error) { return profilingRpcError(error); }
  if (!cycle?.collection_starts_on) return NextResponse.json({ error: "Profiling cycle not found" }, { status: 404 });
  const result = parseProfilingPackage(raw, cycle.collection_starts_on);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  const payload = result.data;
  const { data, error } = await auth.supabase.rpc("phase1_create_profiling_submission", {
    p_cycle_id: payload.cycle_id, p_sitio_id: payload.household.sitio_id, p_payload: payload,
    p_source_type: "manual", p_import_batch_id: null,
  });
  if (error) return profilingRpcError(error);
  try { return NextResponse.json({ data: await getProfilingSubmissionMutationDTO(auth.supabase, payload.cycle_id, String(data)) }, { status: 201 }); }
  catch (readError) { return profilingRpcError(readError); }
}
