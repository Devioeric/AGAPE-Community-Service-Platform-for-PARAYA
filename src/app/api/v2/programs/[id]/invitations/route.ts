import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { createProgramInvitationSchema, phase4InvitationsEnabled } from "@/lib/volunteers/phase4-contracts";
import { createInvitationToken, phase4DatabaseError, phase4Unavailable } from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Ctx) {
  if (!phase4InvitationsEnabled()) return phase4Unavailable();
  const auth = await authorizeAnyCapability(["volunteer.invitation.manage", "volunteer.self"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase4_list_program_invitations", { p_program_id: id });
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({
    data: Array.isArray(data) ? data : [],
    meta: { canAllowExternalEmail: auth.actor.role === "paraya_director" },
  });
}
export async function POST(request: Request, { params }: Ctx) {
  if (!phase4InvitationsEnabled()) return phase4Unavailable();
  const auth = await authorizeAnyCapability(["volunteer.invitation.manage", "volunteer.self"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = createProgramInvitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation.", issues: parsed.error.issues }, { status: 400 });
  const { id } = await params;
  const { token, tokenHash } = createInvitationToken();
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase4_create_program_invitation", {
    p_program_id: id, p_token_hash: tokenHash, p_label: value.label ?? null,
    p_expires_at: value.expiresAt, p_max_uses: value.maxUses,
    p_allowed_email_domain: value.allowedEmailDomain, p_allow_external_email: value.allowExternalEmail,
    p_external_exception_reason: value.externalExceptionReason ?? null,
  });
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data: { ...(data as object), joinPath: `/join/${token}` } }, { status: 201 });
}
