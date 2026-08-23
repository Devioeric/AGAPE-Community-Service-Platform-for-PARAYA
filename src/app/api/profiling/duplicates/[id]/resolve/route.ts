import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

const schema = z.object({ resolution: z.enum(["linked","distinct","exclude"]), reason: z.string().trim().min(3).max(500), linked_entity_id: z.string().uuid().optional().nullable() }).strict().superRefine((value, ctx) => {
  if (value.resolution === "linked" && !value.linked_entity_id) ctx.addIssue({ code: "custom", path: ["linked_entity_id"], message: "A linked entity is required" });
});
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeAnyCapability(["profiling.validate", "profiling.cycle.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Resolution and reason are required" }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_resolve_profiling_duplicate_v2", { p_candidate_id: id, p_resolution: parsed.data.resolution, p_reason: parsed.data.reason, p_linked_entity_id: parsed.data.linked_entity_id ?? null });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { status: data } });
}
