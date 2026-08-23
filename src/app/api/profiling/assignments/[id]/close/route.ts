import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";

const schema = z.object({ effective_to: z.string().date(), reason: z.string().trim().min(3).max(500) }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Effective end date and reason are required" }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_close_mother_leader_assignment", { p_assignment_id: id, p_effective_to: parsed.data.effective_to, p_reason: parsed.data.reason });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}
