import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

const schema = z.object({
  action: z.enum(["resident_inactive", "resident_deceased", "resident_transfer", "resident_merge", "household_moved", "household_dissolved", "household_merge", "consent_withdrawal"]),
  entity_id: z.string().uuid(), expected_version: z.number().int().positive(), effective_on: z.string().date(),
  reason: z.string().trim().min(3).max(500), target_entity_id: z.string().uuid().optional().nullable(),
}).strict().superRefine((value, ctx) => {
  if (["resident_transfer", "resident_merge", "household_merge"].includes(value.action) && !value.target_entity_id) ctx.addIssue({ code: "custom", path: ["target_entity_id"], message: "This action requires a target" });
});

export async function POST(request: Request) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid lifecycle action" }, { status: 400 });
  const input = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase1_apply_profile_lifecycle_action", { p_action: input.action, p_entity_id: input.entity_id, p_expected_version: input.expected_version, p_effective_on: input.effective_on, p_reason: input.reason, p_target_entity_id: input.target_entity_id ?? null });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { row_version: data } });
}
