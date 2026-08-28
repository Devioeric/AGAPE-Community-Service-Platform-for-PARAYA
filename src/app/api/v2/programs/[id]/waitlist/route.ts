import { authorizeCapability } from "@/lib/auth/authorize";
import { phase4InvitationsEnabled } from "@/lib/volunteers/phase4-contracts";
import {
  phase4DatabaseError,
  phase4Unavailable,
} from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  if (!phase4InvitationsEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.waitlist.review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase4_list_program_waitlist", {
    p_program_id: id,
  });
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data: Array.isArray(data) ? data : [] });
}
