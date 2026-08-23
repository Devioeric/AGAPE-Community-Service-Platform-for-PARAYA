import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";
import { OPAQUE_SAMPLE_REFERENCE_PATTERN } from "@/lib/profiling/contracts";

const schema = z.object({
  cycle_id: z.string().uuid(), sitio_id: z.string().uuid(),
  sample_reference: z.string().trim().regex(OPAQUE_SAMPLE_REFERENCE_PATTERN),
  contact_outcome: z.enum(["not_contacted","unavailable","participated","refused","ineligible"]),
  anonymous_household_size: z.number().int().min(0).max(100).optional().nullable(),
}).strict();

export async function POST(request: Request) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.collect");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sample contact outcome" }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase1_record_sample_outcome", { p_cycle_id: value.cycle_id, p_sitio_id: value.sitio_id, p_sample_reference: value.sample_reference, p_contact_outcome: value.contact_outcome, p_anonymous_household_size: value.anonymous_household_size ?? null });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { id: data } });
}
