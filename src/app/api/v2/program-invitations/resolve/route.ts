import { createAdminClient } from "@/lib/supabase/admin";
import { invitationTokenSchema, phase4InvitationsEnabled } from "@/lib/volunteers/phase4-contracts";
import { hashInvitationToken, phase4DatabaseError, phase4Unavailable } from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!phase4InvitationsEnabled()) return phase4Unavailable();
  const parsed = invitationTokenSchema.safeParse(new URL(request.url).searchParams.get("token"));
  if (!parsed.success) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  const { data, error } = await createAdminClient().rpc("phase4_resolve_invitation", { p_token_hash: hashInvitationToken(parsed.data) });
  if (error) return phase4DatabaseError(error);
  if (!data) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  return NextResponse.json({ data });
}
