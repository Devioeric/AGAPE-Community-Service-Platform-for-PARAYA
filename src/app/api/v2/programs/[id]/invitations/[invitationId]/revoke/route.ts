import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { phase4InvitationsEnabled } from "@/lib/volunteers/phase4-contracts";
import { phase4DatabaseError, phase4Unavailable } from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";
import { z } from "zod";
type Ctx = { params: Promise<{ invitationId: string }> };
const schema = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(500) }).strict();
export async function POST(request: Request, { params }: Ctx) {
  if (!phase4InvitationsEnabled()) return phase4Unavailable();
  const auth = await authorizeAnyCapability(["volunteer.invitation.manage", "volunteer.self"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid revocation request." }, { status: 400 });
  const { invitationId } = await params;
  const { data, error } = await auth.supabase.rpc("phase4_revoke_program_invitation", {
    p_invitation_id: invitationId, p_expected_version: parsed.data.expectedVersion, p_reason: parsed.data.reason,
  });
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data });
}
