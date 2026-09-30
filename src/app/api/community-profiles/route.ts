import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { communityProfileDataSchema } from "@/lib/community-profile/schema";
import { PROFILE_COLUMNS, keyFigures, profileScope } from "@/lib/community-profile/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const auth = await authorizeCapability("profiling.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const scope = profileScope(auth.actor);
  if (!scope) return NextResponse.json({ error: "A barangay assignment is required" }, { status: 403, headers });

  const admin = createAdminClient();
  const barangayQuery = admin.from("barangays").select("id, name").eq("is_active", true).order("name");
  const profileQuery = admin.from("barangay_community_profiles").select(PROFILE_COLUMNS);
  const [barangays, profiles] = await Promise.all([
    scope.all ? barangayQuery : barangayQuery.eq("id", scope.barangayId),
    scope.all ? profileQuery : profileQuery.eq("barangay_id", scope.barangayId),
  ]);
  if (barangays.error || profiles.error) return NextResponse.json({ error: "Community profiles are temporarily unavailable" }, { status: 503, headers });

  const byBarangay = new Map((profiles.data ?? []).map((row) => [row.barangay_id as string, row]));
  const data = (barangays.data ?? []).map((barangay) => {
    const row = byBarangay.get(barangay.id);
    if (!row) return { barangay, profile: null };
    const parsed = communityProfileDataSchema.safeParse(row.data);
    return {
      barangay,
      profile: {
        id: row.id, coverage: row.coverage, source_title: row.source_title, collected_on: row.collected_on,
        respondent_households: row.respondent_households, individuals: row.individuals, updated_at: row.updated_at,
        key_figures: keyFigures(parsed.success ? parsed.data : {}),
      },
    };
  });
  return NextResponse.json({ data }, { headers });
}
