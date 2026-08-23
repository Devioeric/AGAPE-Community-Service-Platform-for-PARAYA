import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";

export async function PATCH(request: Request) {
  const auth = await authorizeCapability("profiling.privacy.configure");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = z.object({ threshold: z.number().int().min(5).max(100) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Threshold must be an integer from 5 to 100" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_set_suppression_threshold", { p_threshold: parsed.data.threshold });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { suppression_threshold: data } });
}
