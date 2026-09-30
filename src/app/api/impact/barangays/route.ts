import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPACT_HEADERS, impactFailure, loadImpactRows, manilaToday } from "@/lib/impact/load";
import { summarizeBarangays, summarizePrograms } from "@/lib/impact/summary";

/** One impact summary per active barangay, including barangays with no programs yet. */
export async function GET() {
  const auth = await authorizeCapability("impact.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: IMPACT_HEADERS });
  try {
    const admin = createAdminClient();
    const [rows, profiles] = await Promise.all([
      loadImpactRows(admin),
      admin.from("barangay_community_profiles").select("barangay_id").throwOnError(),
    ]);
    const withProfile = new Set((profiles.data ?? []).map((row) => row.barangay_id as string));
    const data = summarizeBarangays(summarizePrograms({ ...rows, today: manilaToday() }), rows.barangays)
      .map((row) => ({ ...row, profileRecorded: withProfile.has(row.barangayId) }));
    return NextResponse.json({ data }, { headers: IMPACT_HEADERS });
  } catch (error) {
    const failure = impactFailure(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: IMPACT_HEADERS });
  }
}
