import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";

// Look up a volunteer user by email. Returns only minimal info (id, role,
// full_name) so partner accounts can resolve an email to a user_id when
// proposing a volunteer assignment — without exposing the full user list.
// Restricted to roles that need it: PARAYA staff (already have /api/volunteers)
// and partner accounts.

export async function GET(request: Request) {
  const auth = await authorizeCapability("volunteer.directory.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url   = new URL(request.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, full_name, email, role")
    .ilike("email", email)
    .eq("role", "volunteer")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Volunteer not found" }, { status: 404 });

  return NextResponse.json({ data });
}
