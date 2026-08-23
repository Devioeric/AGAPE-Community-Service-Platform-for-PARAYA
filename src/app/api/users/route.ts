import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await authorizeCapability("admin.users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = auth.supabase;

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email, role, status, barangay_id, permissions, created_at, updated_at, barangays(name)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
