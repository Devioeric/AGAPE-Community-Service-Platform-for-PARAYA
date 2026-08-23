import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

const schema = z.object({
  resident_id: z.string().uuid(),
  expected_version: z.number().int().positive(),
  effective_on: z.string().date(),
  consented_by_name: z.string().trim().min(1).max(160),
  guardian_relationship: z.string().trim().min(1).max(60).optional().nullable(),
}).strict();

export async function POST(request: Request) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid re-consent record" }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase1_record_resident_reconsent", {
    p_resident_id: value.resident_id, p_expected_version: value.expected_version, p_effective_on: value.effective_on,
    p_consented_by_name: value.consented_by_name, p_guardian_relationship: value.guardian_relationship ?? null,
  });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { row_version: data } });
}
