import { authorizeCapability } from "@/lib/auth/authorize";
import { phase4InvitationsEnabled } from "@/lib/volunteers/phase4-contracts";
import { phase4DatabaseError, phase4Unavailable } from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!phase4InvitationsEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase4_list_my_leader_programs");
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data: Array.isArray(data) ? data : [] });
}
