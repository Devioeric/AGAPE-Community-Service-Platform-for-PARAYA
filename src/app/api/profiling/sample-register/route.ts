import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";
import { OPAQUE_SAMPLE_REFERENCE_PATTERN } from "@/lib/profiling/contracts";

const unitSchema = z.object({
  sample_reference: z.string().trim().regex(OPAQUE_SAMPLE_REFERENCE_PATTERN),
  sitio_id: z.string().uuid(),
  household_id: z.string().uuid().optional().nullable(),
}).strict();
const createSchema = z.object({ cycle_id: z.string().uuid(), units: z.array(unitSchema).min(1).max(10_000) }).strict();

export async function GET(request: Request) {
  const auth = await authorizeAnyCapability(["profiling.collect", "profiling.validate", "profiling.detail.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const cycleId = url.searchParams.get("cycle_id");
  const sitioId = url.searchParams.get("sitio_id");
  if (!cycleId) return NextResponse.json({ error: "cycle_id is required" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_list_sample_units", { p_cycle_id: cycleId, p_sitio_id: sitioId || null });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid non-identifying sample register" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_register_sample_units", { p_cycle_id: parsed.data.cycle_id, p_units: parsed.data.units });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data }, { status: 201 });
}
