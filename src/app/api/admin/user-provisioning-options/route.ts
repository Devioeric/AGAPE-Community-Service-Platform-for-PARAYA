import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type BarangayOption = {
  id: string;
  name: string;
};

export async function GET() {
  const auth = await authorizeCapability("admin.users.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await createAdminClient()
    .from("barangays")
    .select("id,name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Unable to load account-provisioning options." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      barangays: (data as BarangayOption[]).map(({ id, name }) => ({ id, name })),
    },
  });
}
