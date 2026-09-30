import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isActiveAccount } from "@/lib/auth/account-status";
import { hasCapability } from "@/lib/auth/capabilities";
import { NextResponse } from "next/server";

const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "Unable to load barangay dashboard" }, { status: 500, headers });

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
    if (!isActiveAccount(self) || self?.role !== "barangay_secretary" || !self.barangay_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
    }

    const barangayId = self.barangay_id;
    const canReadNeeds = hasCapability(self.role, self.permissions, "community_need.read");
    // The Secretary's retained reporting authority permits own-barangay program
    // summaries and aggregate participation, not program or volunteer management.
    const canReadReports = hasCapability(self.role, self.permissions, "report.read");
    if (!canReadNeeds && !canReadReports) {
      return NextResponse.json({ data: { recentPrograms: [], actionItems: [] } }, { headers });
    }

    const admin = createAdminClient();
    const [communityNeeds, recentPrograms] = await Promise.all([
      canReadNeeds ? admin.from("community_needs")
        .select("id, title, priority, created_at, approval_status")
        .eq("barangay_id", barangayId)
        .eq("approval_status", "needs_revision")
        .order("created_at", { ascending: false })
        .limit(20) : Promise.resolve({ data: [], error: null }),

      canReadReports ? admin.from("programs")
        .select("id, title, status, start_date, end_date")
        .eq("barangay_id", barangayId)
        .order("start_date", { ascending: false })
        .limit(3) : Promise.resolve({ data: [], error: null }),
    ]);
    if (communityNeeds.error || recentPrograms.error) return unavailable();

    const actionItems = (communityNeeds.data ?? []).map((need) => ({
      id: need.id,
      task: `Revise returned need: ${need.title}`,
      due: need.created_at,
      priority: (need.priority ?? "medium").toLowerCase(),
      href: `/barangay/submit-needs?revise=${need.id}`,
    }));

    const programIds = (recentPrograms.data ?? []).map((program) => program.id);
    const programSignups = programIds.length > 0
      ? await admin.from("program_signups")
          .select("program_id, programs!inner(barangay_id)")
          .eq("programs.barangay_id", barangayId)
          .in("program_id", programIds)
          .neq("status", "withdrawn")
      : { data: [], error: null };
    if (programSignups.error) return unavailable();
    const signupCounts: Record<string, number> = {};
    for (const row of programSignups.data ?? []) {
      signupCounts[row.program_id] = (signupCounts[row.program_id] ?? 0) + 1;
    }

    // KPIs belong exclusively to /api/dashboard/summary. This endpoint supplies
    // only the existing lower panels, with denied modules absent from the data.
    return NextResponse.json({
      data: {
        recentPrograms: (recentPrograms.data ?? []).map((program) => ({
          id: program.id,
          title: program.title,
          status: program.status,
          start_date: program.start_date,
          end_date: program.end_date,
          volunteers: signupCounts[program.id] ?? 0,
        })),
        actionItems,
      },
    }, { headers });
  } catch {
    return unavailable();
  }
}
