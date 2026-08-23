import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit } from "@/lib/audit/log";
import { NextResponse } from "next/server";

const LEGACY_SAFE_FIELDS = "id, barangay_id, household_number, member_count, sitio, collected_at, legacy_data_status, barangays(name)";

export async function GET(request: Request) {
  const auth = await authorizeCapability("profiling.detail.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const barangayId = searchParams.get("barangay_id");

  let effectiveBarangayId: string | null = null;
  if (auth.actor.role === "barangay_captain" || auth.actor.role === "barangay_secretary") {
    if (!auth.actor.barangayId) return NextResponse.json({ data: [] });
    effectiveBarangayId = auth.actor.barangayId;
  } else if (auth.actor.role === "paraya_researcher") {
    effectiveBarangayId = barangayId;
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const auditRecorded = await recordAudit({
    user_id: auth.actor.id,
    user_email: auth.actor.email,
    action: "Legacy household summary viewed",
    resource_type: "household_profiles",
    level: "warning",
    metadata: { barangay_id: effectiveBarangayId, fields: LEGACY_SAFE_FIELDS },
  });
  if (!auditRecorded) return NextResponse.json({ error: "Unable to establish the required audit trail" }, { status: 503 });

  const admin = createAdminClient();
  let query = admin
    .from("household_profiles")
    .select(LEGACY_SAFE_FIELDS)
    .order("collected_at", { ascending: false });
  if (effectiveBarangayId) query = query.eq("barangay_id", effectiveBarangayId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map((profile) => ({ ...profile, legacy_data_status: profile.legacy_data_status ?? "legacy_unverified" })) });
}

export async function POST() {
  return NextResponse.json(
    { error: "Legacy household data is read-only. Use the cycle-aware profiling workflow.", code: "legacy_profile_read_only" },
    { status: 410 },
  );
}
