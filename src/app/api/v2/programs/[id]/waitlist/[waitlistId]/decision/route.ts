import { authorizeCapability } from "@/lib/auth/authorize";
import {
  phase4InvitationsEnabled,
  waitlistDecisionSchema,
} from "@/lib/volunteers/phase4-contracts";
import {
  phase4DatabaseError,
  phase4Unavailable,
} from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ waitlistId: string }> };

export async function POST(request: Request, { params }: Ctx) {
  if (!phase4InvitationsEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.waitlist.review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = waitlistDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid waitlist decision." }, { status: 400 });
  }
  const { waitlistId } = await params;
  const { data, error } = await auth.supabase.rpc("phase4_review_waitlist", {
    p_waitlist_id: waitlistId,
    p_action: parsed.data.action,
    p_expected_version: parsed.data.expectedVersion,
    p_remarks: parsed.data.remarks ?? null,
  });
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data });
}
