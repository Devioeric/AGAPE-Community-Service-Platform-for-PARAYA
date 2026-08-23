import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

const schema = z.object({ expected_version: z.number().int().positive(), decision: z.enum(["approve","return"]), reason: z.string().trim().min(3).max(1000).optional().nullable() }).strict().superRefine((value, ctx) => {
  if (value.decision === "return" && !value.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "A return reason is required" });
});
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.validate");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_decide_profiling_submission", { p_submission_id: id, p_expected_version: parsed.data.expected_version, p_decision: parsed.data.decision, p_reason: parsed.data.reason ?? null });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { row_version: data } });
}
