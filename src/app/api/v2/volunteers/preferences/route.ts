import { authorizeCapability } from "@/lib/auth/authorize";
import { phase4MatchingEnabled, volunteerPreferencesInputSchema } from "@/lib/volunteers/phase4-contracts";
import { phase4DatabaseError, phase4Unavailable } from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!phase4MatchingEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.preferences.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase4_get_my_preferences");
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data });
}

export async function PUT(request: Request) {
  if (!phase4MatchingEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.preferences.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = volunteerPreferencesInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid volunteer preferences.", issues: parsed.error.issues }, { status: 400 });
  const { expectedVersion, ...payload } = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase4_set_my_preferences", { p_payload: payload, p_expected_version: expectedVersion });
  if (error) return phase4DatabaseError(error);
  return NextResponse.json({ data });
}
