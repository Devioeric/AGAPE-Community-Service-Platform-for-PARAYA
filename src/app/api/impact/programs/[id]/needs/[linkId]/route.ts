import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPACT_HEADERS } from "@/lib/impact/load";

const idSchema = z.string().uuid();
const bodySchema = z.object({}).strict();
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: IMPACT_HEADERS });

/** Removes a need link that was added by hand. Links carried over from an approved proposal stay. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const auth = await authorizeCapability("impact.manage");
  if (!auth.ok) return fail(auth.status, auth.error);
  const body = await request.json().catch(() => ({}));
  if (!bodySchema.safeParse(body).success) return fail(400, "The request body is invalid");
  const { id, linkId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(linkId).success) return fail(404, "Link not found");

  const admin = createAdminClient();
  const link = await admin.from("program_need_links_v2").select("id, need_id, source_proposal_need_link_id").eq("id", linkId).eq("program_id", id).maybeSingle();
  if (link.error) return fail(503, "The link could not be removed right now");
  if (!link.data) return fail(404, "Link not found");
  if (link.data.source_proposal_need_link_id) return fail(422, "This need came from the approved proposal and cannot be unlinked here");

  const removed = await admin.from("program_need_links_v2").delete().eq("id", linkId).eq("program_id", id).is("source_proposal_need_link_id", null);
  if (removed.error) return fail(503, "The link could not be removed right now");
  await recordAudit({
    user_id: auth.actor.id, user_email: auth.actor.email, action: "impact.need_unlinked", resource_type: "program", resource_id: id,
    metadata: { need_id: link.data.need_id, link_id: linkId },
  });
  return NextResponse.json({ data: { id: linkId } }, { headers: IMPACT_HEADERS });
}
