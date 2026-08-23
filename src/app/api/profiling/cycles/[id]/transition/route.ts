import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

const schema = z.object({ expected_version: z.number().int().positive(), to_status: z.enum(["collecting","validating","completed","archived"]), reason: z.string().trim().max(500).optional().nullable() }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cycle transition" }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_transition_profiling_cycle", { p_cycle_id: id, p_expected_version: parsed.data.expected_version, p_to_status: parsed.data.to_status, p_reason: parsed.data.reason ?? null });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { row_version: data } });
}
