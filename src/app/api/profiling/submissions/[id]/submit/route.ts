import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.collect");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = z.object({ expected_version: z.number().int().positive() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid submission request" }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_submit_profiling_package", { p_submission_id: id, p_expected_version: parsed.data.expected_version });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { row_version: data } });
}
