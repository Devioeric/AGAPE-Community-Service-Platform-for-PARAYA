import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPACT_HEADERS } from "@/lib/impact/load";

const idSchema = z.string().uuid();
const bodySchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: IMPACT_HEADERS });

/** Voids a recorded SDG contribution with a reason; the row stays for the correction history. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("impact.manage");
  if (!auth.ok) return fail(auth.status, auth.error);
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return fail(404, "Contribution not found");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Give a reason of at least 3 characters");

  const voided = await createAdminClient().from("program_sdg_outcomes")
    .update({ voided_at: new Date().toISOString(), voided_by: auth.actor.id, void_reason: parsed.data.reason })
    .eq("id", id).is("voided_at", null)
    .select("id, program_id").maybeSingle();
  if (voided.error) return fail(503, "The contribution could not be voided right now");
  if (!voided.data) return fail(404, "Contribution not found or already voided");
  await recordAudit({
    user_id: auth.actor.id, user_email: auth.actor.email, action: "impact.sdg_outcome_voided", resource_type: "program", resource_id: voided.data.program_id,
    metadata: { outcome_id: id },
  });
  return NextResponse.json({ data: { id } }, { headers: IMPACT_HEADERS });
}
