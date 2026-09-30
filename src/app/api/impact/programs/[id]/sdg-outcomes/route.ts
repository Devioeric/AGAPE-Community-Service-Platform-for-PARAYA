import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPACT_HEADERS } from "@/lib/impact/load";

const idSchema = z.string().uuid();
const bodySchema = z.object({
  sdg_goal: z.union([z.literal(4), z.literal(9), z.literal(11), z.literal(17)]),
  actual_indicator: z.string().trim().min(3).max(160),
  actual_contribution: z.string().trim().min(10).max(2000),
}).strict();
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: IMPACT_HEADERS });

/** Records what a started program contributed to one of the four focus SDGs. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("impact.manage");
  if (!auth.ok) return fail(auth.status, auth.error);
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return fail(404, "Program not found");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Choose an SDG, name what was measured, and describe the contribution (at least 10 characters)");

  const admin = createAdminClient();
  const program = await admin.from("programs").select("id, status").eq("id", id).maybeSingle();
  if (program.error) return fail(503, "The contribution could not be recorded right now");
  if (!program.data) return fail(404, "Program not found");
  if (!["active", "completed"].includes(String(program.data.status))) return fail(422, "Record SDG contributions once the program is active or completed");

  const inserted = await admin.from("program_sdg_outcomes").insert({ program_id: id, ...parsed.data, recorded_by: auth.actor.id }).select("id").single();
  if (inserted.error || !inserted.data) return fail(503, "The contribution could not be recorded right now");
  await recordAudit({
    user_id: auth.actor.id, user_email: auth.actor.email, action: "impact.sdg_outcome_recorded", resource_type: "program", resource_id: id,
    metadata: { outcome_id: inserted.data.id, sdg_goal: parsed.data.sdg_goal },
  });
  return NextResponse.json({ data: { id: inserted.data.id } }, { status: 201, headers: IMPACT_HEADERS });
}
