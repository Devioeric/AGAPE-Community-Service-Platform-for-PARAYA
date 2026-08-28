import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { invitationJoinSchema, phase4InvitationsEnabled } from "@/lib/volunteers/phase4-contracts";
import { hashInvitationEmail, hashInvitationToken, invitationFailureReason, phase4DatabaseError, phase4Unavailable } from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
  if (!phase4InvitationsEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = invitationJoinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !auth.actor.email) return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });
  const admin = createAdminClient();
  const tokenHash = hashInvitationToken(parsed.data.token);
  const emailHash = hashInvitationEmail(auth.actor.email);
  const { data, error } = await admin.rpc("phase4_consume_invitation_for_user", {
    p_token_hash: tokenHash, p_user_id: auth.actor.id, p_email_hash: emailHash,
  });
  if (error) {
    await admin.rpc("phase4_record_invitation_failure", {
      p_token_hash: tokenHash,
      p_user_id: auth.actor.id,
      p_email_hash: emailHash,
      p_reason_code: invitationFailureReason(error),
    });
    return phase4DatabaseError(error);
  }
  return NextResponse.json({ data });
}
