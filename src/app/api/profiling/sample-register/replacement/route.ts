import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";
import { OPAQUE_SAMPLE_REFERENCE_PATTERN } from "@/lib/profiling/contracts";

const schema = z.object({ sample_unit_id: z.string().uuid(), replacement_reference: z.string().trim().regex(OPAQUE_SAMPLE_REFERENCE_PATTERN), reason: z.string().trim().min(3).max(500) }).strict();
export async function POST(request: Request) {
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Replacement reference and reason are required" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_create_sample_replacement", { p_sample_unit_id: parsed.data.sample_unit_id, p_replacement_reference: parsed.data.replacement_reference, p_reason: parsed.data.reason });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data }, { status: 201 });
}
