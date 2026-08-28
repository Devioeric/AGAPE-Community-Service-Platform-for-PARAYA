import { authorizeCapability } from "@/lib/auth/authorize";
import { programMatchingSetupSchema, phase4MatchingEnabled } from "@/lib/volunteers/phase4-contracts";
import { phase4DatabaseError, phase4Unavailable } from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Ctx) {
  if (!phase4MatchingEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.match.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase4_get_program_matching_setup", { p_program_id: id });
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data });
}
export async function PUT(request: Request, { params }: Ctx) {
  if (!phase4MatchingEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = programMatchingSetupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid matching setup.", issues: parsed.error.issues }, { status: 400 });
  const { expectedVersion, ...payload } = parsed.data;
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase4_set_program_matching_setup", {
    p_program_id: id, p_payload: payload, p_expected_version: expectedVersion,
  });
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data });
}
