import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";

export async function POST(request: Request) {
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = z.object({ mother_leader_id: z.string().uuid(), sitio_id: z.string().uuid(), effective_from: z.string().date(), effective_to: z.string().date().optional().nullable() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_assign_mother_leader", { p_mother_leader_id: parsed.data.mother_leader_id, p_sitio_id: parsed.data.sitio_id, p_effective_from: parsed.data.effective_from, p_effective_to: parsed.data.effective_to ?? null });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
