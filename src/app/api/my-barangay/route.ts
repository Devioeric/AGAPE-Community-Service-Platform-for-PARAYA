import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: self } = await supabase
    .from("users").select("role, barangay_id").eq("id", user.id).single();

  if (!self?.barangay_id) {
    return NextResponse.json({ data: null, error: "No barangay assigned" }, { status: 200 });
  }

  const admin = createAdminClient();

  // Barangay info + history (history may be empty if migration not yet run)
  const { data: barangay, error } = await admin
    .from("barangays")
    .select("*, partnership_history(id, event_type, notes, date, created_at, officer:officer_id(full_name))")
    .eq("id", self.barangay_id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Programs hosted in this barangay (open + recent)
  const { data: programs } = await admin
    .from("programs")
    .select("id, title, status, start_date, end_date")
    .eq("barangay_id", self.barangay_id)
    .order("start_date", { ascending: false })
    .limit(10);

  return NextResponse.json({
    data: {
      barangay,
      programs: programs ?? [],
      viewerRole: self.role,
    },
  });
}
