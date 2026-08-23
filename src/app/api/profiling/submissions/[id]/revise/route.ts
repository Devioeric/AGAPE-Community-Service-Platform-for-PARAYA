import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseProfilingPackage } from "@/lib/profiling/contracts";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.collect");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const raw = await request.json().catch(() => null);
  const cycleId = raw && typeof raw === "object" ? String((raw as Record<string, unknown>).cycle_id ?? "") : "";
  const { data: cycle } = await createAdminClient().from("profiling_cycles").select("collection_starts_on").eq("id", cycleId).maybeSingle();
  if (!cycle?.collection_starts_on) return NextResponse.json({ error: "Profiling cycle not found" }, { status: 404 });
  const parsed = parseProfilingPackage(raw, cycle.collection_starts_on);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_revise_returned_profiling_submission", { p_submission_id: id, p_expected_version: parsed.data.expected_version, p_payload: parsed.data });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
