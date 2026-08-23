import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";

const updateSchema = z.object({
  mode: z.enum(["off", "synthetic", "live"]),
  synthetic_user_ids: z.array(z.string().uuid()).max(100).default([]),
  synthetic_barangay_ids: z.array(z.string().uuid()).max(20).default([]),
  privacy_approved: z.boolean().default(false),
}).strict();

export async function GET() {
  const auth = await authorizeAnyCapability(["profiling.cycle.manage", "profiling.privacy.configure"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase1_get_profiling_runtime");
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}

export async function PUT(request: Request) {
  const auth = await authorizeCapability("profiling.privacy.configure");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profiling runtime configuration" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_set_profiling_runtime", {
    p_mode: parsed.data.mode,
    p_synthetic_user_ids: parsed.data.synthetic_user_ids,
    p_synthetic_barangay_ids: parsed.data.synthetic_barangay_ids,
    p_privacy_approved: parsed.data.privacy_approved,
  });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}
