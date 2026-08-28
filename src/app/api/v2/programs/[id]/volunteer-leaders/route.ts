import { authorizeCapability } from "@/lib/auth/authorize";
import {
  phase4InvitationsEnabled,
  programLeaderSetSchema,
} from "@/lib/volunteers/phase4-contracts";
import {
  phase4DatabaseError,
  phase4Unavailable,
} from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  if (!phase4InvitationsEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.invitation.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase4_list_program_leaders", {
    p_program_id: id,
  });
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data });
}

export async function PUT(request: Request, { params }: Ctx) {
  if (!phase4InvitationsEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = programLeaderSetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid program leader selection." }, { status: 400 });
  }
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase4_set_program_leaders", {
    p_program_id: id,
    p_volunteer_ids: parsed.data.volunteerIds,
    p_expected_version: parsed.data.expectedVersion,
  });
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data });
}
