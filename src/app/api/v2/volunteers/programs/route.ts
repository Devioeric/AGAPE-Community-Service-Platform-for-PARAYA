import { authorizeCapability } from "@/lib/auth/authorize";
import { phase4MatchingEnabled } from "@/lib/volunteers/phase4-contracts";
import { phase4DatabaseError, phase4Unavailable } from "@/lib/volunteers/phase4-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!phase4MatchingEnabled()) return phase4Unavailable();
  const auth = await authorizeCapability("volunteer.preferences.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase4_list_my_program_matches");
  if (error) return phase4DatabaseError(error);
  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return NextResponse.json({ data: rows.map((row) => ({
    id: row.id, title: row.title, description: row.description, status: row.status,
    start_date: row.startDate, end_date: row.endDate, max_volunteers: row.maxVolunteers,
    signup_count: row.signupCount, my_signup: row.mySignup,
    barangays: row.barangay ? { name: row.barangay } : null,
    match: { eligible: row.eligible, matchedSkillCount: row.matchedSkillCount,
      requiredSkillCount: row.requiredSkillCount, availability: row.availability,
      withinRadius: row.withinRadius, distanceBand: row.distanceBand },
  })) });
}
