import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPACT_HEADERS } from "@/lib/impact/load";

const idSchema = z.string().uuid();
const status = z.enum(["identified", "in_progress", "addressed"]);
const bodySchema = z.object({ program_id: z.string().uuid(), expected_status: status, status }).strict();
const fail = (code: number, error: string) => NextResponse.json({ error }, { status: code, headers: IMPACT_HEADERS });

/**
 * Updates how far a community need has been met, from a program that answers
 * it. The need must be approved and linked to that program; the expected status
 * guards against overwriting someone else's change.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("impact.manage");
  if (!auth.ok) return fail(auth.status, auth.error);
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return fail(404, "Need not found");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Choose the program and the new status");

  const admin = createAdminClient();
  const link = await admin.from("program_need_links_v2").select("id").eq("need_id", id).eq("program_id", parsed.data.program_id).limit(1);
  if (link.error) return fail(503, "The need could not be updated right now");
  if ((link.data ?? []).length === 0) return fail(422, "Link this need to the program before updating it");

  const updated = await admin.from("community_needs")
    .update({ status: parsed.data.status, resolved: parsed.data.status === "addressed", updated_at: new Date().toISOString() })
    .eq("id", id).eq("approval_status", "approved").eq("status", parsed.data.expected_status)
    .select("id, status").maybeSingle();
  if (updated.error) return fail(503, "The need could not be updated right now");
  if (!updated.data) return fail(409, "This need changed meanwhile. Reload and try again.");

  await recordAudit({
    user_id: auth.actor.id, user_email: auth.actor.email, action: "impact.need_status_changed", resource_type: "community_need", resource_id: id,
    metadata: { program_id: parsed.data.program_id, from: parsed.data.expected_status, to: parsed.data.status },
  });
  return NextResponse.json({ data: updated.data }, { headers: IMPACT_HEADERS });
}
