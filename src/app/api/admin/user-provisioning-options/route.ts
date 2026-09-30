import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { ADMIN_ASSIGNABLE_LOGIN_ROLES } from "@/lib/auth/provisioning";
import { ROLE_LABELS } from "@/lib/auth/roles";

type BarangayOption = {
  id: string;
  name: string;
};

export async function GET() {
  const auth = await authorizeCapability("admin.users.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const [{ data, error }, { count: activeOfficerCount }, { count: activeContributorCount }] = await Promise.all([
    admin
    .from("barangays")
    .select("id,name")
    .eq("is_active", true)
    .order("name", { ascending: true }),
    admin.from("users").select("id", { count: "exact", head: true }).eq("role", "paraya_officer").eq("status", "active").eq("is_active", true),
    admin.from("users").select("id", { count: "exact", head: true }).eq("role", "contributor").eq("status", "active").eq("is_active", true),
  ]);

  if (error) {
    return NextResponse.json(
      { error: "Unable to load account-provisioning options." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      barangays: (data as BarangayOption[]).map(({ id, name }) => ({ id, name })),
      roles: ADMIN_ASSIGNABLE_LOGIN_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] ?? value })),
      activeParayaOfficerCount: activeOfficerCount ?? 0,
      activeContributorCount: activeContributorCount ?? 0,
      consolidation: {
        canonicalRole: "paraya_officer",
        historicalRoles: ["paraya_director", "paraya_associate", "paraya_researcher"],
        contributorRole: "contributor",
        contributorHistoricalRoles: ["office", "student_org", "department"],
      },
    },
  });
}
