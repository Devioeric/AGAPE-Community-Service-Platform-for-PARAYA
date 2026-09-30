import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { communityProfileDataSchema } from "@/lib/community-profile/schema";
import { evaluateProfileSignals } from "@/lib/community-profile/need-signals";
import { profileScope } from "@/lib/community-profile/server";

const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const auth = await authorizeCapability("community_need.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  if (!hasCapability(auth.actor.role, auth.actor.permissions, "profiling.aggregate.read") || profileScope(auth.actor)?.all !== true) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const admin = createAdminClient();
  const profiles = await admin.from("barangay_community_profiles").select("id,barangay_id,updated_at,coverage,data");
  if (profiles.error) return NextResponse.json({ error: "Community profile signals are temporarily unavailable" }, { status: 503, headers });
  const barangayIds = (profiles.data ?? []).map((row) => row.barangay_id);
  const [barangays, decisions] = await Promise.all([
    barangayIds.length ? admin.from("barangays").select("id,name").in("id", barangayIds) : Promise.resolve({ data: [], error: null }),
    profiles.data?.length ? admin.from("community_profile_signal_decisions").select("profile_id,profile_updated_at,rule_code").in("profile_id", profiles.data.map((row) => row.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  if (barangays.error || decisions.error) return NextResponse.json({ error: "Community profile signals are temporarily unavailable" }, { status: 503, headers });
  const names = new Map((barangays.data ?? []).map((row) => [row.id, row.name]));
  const decided = new Set((decisions.data ?? []).map((row) => `${row.profile_id}:${row.profile_updated_at}:${row.rule_code}`));
  const data = (profiles.data ?? []).map((profile) => {
    const parsed = communityProfileDataSchema.safeParse(profile.data); if (!parsed.success) return null;
    const signals = evaluateProfileSignals(parsed.data).filter((signal) => !decided.has(`${profile.id}:${profile.updated_at}:${signal.code}`));
    return signals.length ? { barangay: { id: profile.barangay_id, name: names.get(profile.barangay_id) ?? profile.barangay_id }, profile: { id: profile.id, updated_at: profile.updated_at, coverage: profile.coverage }, signals } : null;
  }).filter(Boolean);
  return NextResponse.json({ data }, { headers });
}
