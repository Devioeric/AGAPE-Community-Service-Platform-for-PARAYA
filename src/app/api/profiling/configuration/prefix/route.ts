import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";

const schema = z.object({ barangay_id: z.string().uuid(), prefix: z.string().trim().regex(/^[A-Za-z0-9]{2,8}$/) }).strict();
export async function PUT(request: Request) {
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A 2-8 character barangay prefix is required" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_set_barangay_profile_prefix", { p_barangay_id: parsed.data.barangay_id, p_prefix: parsed.data.prefix });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { prefix: data } });
}
