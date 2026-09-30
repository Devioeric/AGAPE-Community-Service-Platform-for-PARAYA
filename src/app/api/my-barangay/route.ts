import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isActiveAccount } from "@/lib/auth/account-status";
import { hasCapability } from "@/lib/auth/capabilities";
import { NextResponse } from "next/server";

const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "Unable to load assigned barangay" }, { status: 500, headers });

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });

    const { data: self, error: profileError } = await supabase
      .from("users")
      .select("role, barangay_id, permissions, status, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return unavailable();
    if (!isActiveAccount(self) || !self || !["barangay_secretary", "volunteer"].includes(self.role) || !self.barangay_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
    }

    const isVolunteer = self.role === "volunteer";
    if (isVolunteer && !hasCapability(self.role, self.permissions, "volunteer.self")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
    }
    const canReadPartnership = hasCapability(self.role, self.permissions, "partnership.read");
    const canReadSkillsAssets = hasCapability(self.role, self.permissions, "skill_asset.read");
    if (!isVolunteer && !canReadPartnership && !canReadSkillsAssets) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
    }

    const admin = createAdminClient();
    // Skills/assets needs only its assigned barangay identity. A denied
    // partnership module must not expose contact details or relationship history.
    if (!isVolunteer && !canReadPartnership) {
      const { data: barangay, error } = await admin.from("barangays")
        .select("id, name")
        .eq("id", self.barangay_id)
        .single();
      if (error) return unavailable();
      if (!barangay) return NextResponse.json({ error: "Assigned barangay unavailable" }, { status: 404, headers });
      return NextResponse.json({
        data: { barangay: { id: barangay.id, name: barangay.name }, programs: [], viewerRole: self.role },
      }, { headers });
    }

    // The existing volunteer My Assigned Barangay page is a narrow self-service
    // community view, not a grant to browse the partnership registry.
    const { data: barangay, error } = await admin.from("barangays")
      .select("id, name, municipality, province, contact_person, contact_phone, contact_email, total_population, total_households, partnership_start, is_active, partnership_history(id, event_type, notes, date, created_at, officer:officer_id(full_name))")
      .eq("id", self.barangay_id)
      .single();
    if (error) return unavailable();
    if (!barangay) return NextResponse.json({ error: "Assigned barangay unavailable" }, { status: 404, headers });

    // Preserve the Secretary's own-barangay reporting summary without granting
    // general program.read. Partnership history remains partnership-scoped.
    const canReadPrograms = hasCapability(self.role, self.permissions, isVolunteer ? "program.read" : "report.read");
    const programs = canReadPrograms
      ? await admin.from("programs")
          .select("id, title, status, start_date, end_date")
          .eq("barangay_id", self.barangay_id)
          .order("start_date", { ascending: false })
          .limit(10)
      : { data: [], error: null };
    if (programs.error) return unavailable();

    return NextResponse.json({
      data: { barangay, programs: programs.data ?? [], viewerRole: self.role },
    }, { headers });
  } catch {
    return unavailable();
  }
}
