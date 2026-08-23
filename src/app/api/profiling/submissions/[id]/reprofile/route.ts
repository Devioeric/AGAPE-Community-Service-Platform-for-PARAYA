import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";
import { OPAQUE_SAMPLE_REFERENCE_PATTERN } from "@/lib/profiling/contracts";

const schema = z.object({ sample_reference: z.string().trim().regex(OPAQUE_SAMPLE_REFERENCE_PATTERN) }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.collect");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A registered sample reference is required" }, { status: 400 });
  const { id } = await context.params;
  const { data, error } = await auth.supabase.rpc("phase1_begin_profiling_revision", { p_cycle_id: id, p_sample_reference: parsed.data.sample_reference });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}
