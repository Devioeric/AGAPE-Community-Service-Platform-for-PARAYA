import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: self } = await supabase
    .from("users")
    .select("role, barangay_id")
    .eq("id", user.id)
    .single();

  // Without a barangay assignment, return an empty shell so the UI can render.
  if (!self?.barangay_id) {
    return NextResponse.json({
      data: {
        stats: { activePartnerships: 0, pendingSubmissions: 0, totalBeneficiaries: 0 },
        recentPrograms: [],
        actionItems:    [],
      },
    });
  }

  const admin = createAdminClient();
  const barangayId = self.barangay_id;

  const [
    activePrograms,
    pendingNeeds,
    allSignups,
    recentPrograms,
  ] = await Promise.all([
    // Active or upcoming programs in this barangay
    admin.from("programs")
      .select("id", { count: "exact", head: true })
      .eq("barangay_id", barangayId)
      .in("status", ["active", "upcoming"]),

    // Community needs awaiting captain approval
    admin.from("community_needs")
      .select("id, title, priority, created_at", { count: "exact" })
      .eq("barangay_id", barangayId)
      .eq("approval_status", "pending_captain")
      .order("created_at", { ascending: false })
      .limit(5),

    // Distinct volunteer signups across this barangay's programs — proxy for beneficiaries
    admin.from("program_signups")
      .select("volunteer_id, programs!inner(barangay_id)")
      .eq("programs.barangay_id", barangayId)
      .neq("status", "withdrawn"),

    // Latest 3 programs in the barangay for the Recent Programs card
    admin.from("programs")
      .select("id, title, status, start_date, end_date")
      .eq("barangay_id", barangayId)
      .order("start_date", { ascending: false })
      .limit(3),
  ]);

  // Build action items from pending community needs (one per row, priority preserved)
  const actionItems = (pendingNeeds.data ?? []).map((n) => ({
    id:       n.id,
    task:     `Review need: ${n.title}`,
    due:      n.created_at,
    priority: (n.priority ?? "medium").toLowerCase(),
  }));

  // Distinct volunteers reached across all programs in this barangay
  const uniqueVolunteers = new Set(
    (allSignups.data ?? []).map((s) => s.volunteer_id).filter(Boolean)
  );

  // Signup counts per program for the Recent Programs subtitle
  const programIds = (recentPrograms.data ?? []).map((p) => p.id);
  const { data: programSignupRows } = programIds.length > 0
    ? await admin.from("program_signups")
        .select("program_id, status")
        .in("program_id", programIds)
    : { data: [] };
  const signupCounts: Record<string, number> = {};
  for (const row of programSignupRows ?? []) {
    if (row.status === "withdrawn") continue;
    signupCounts[row.program_id] = (signupCounts[row.program_id] ?? 0) + 1;
  }

  return NextResponse.json({
    data: {
      stats: {
        activePartnerships:  activePrograms.count ?? 0,
        pendingSubmissions:  pendingNeeds.count   ?? 0,
        totalBeneficiaries:  uniqueVolunteers.size,
      },
      recentPrograms: (recentPrograms.data ?? []).map((p) => ({
        id:           p.id,
        title:        p.title,
        status:       p.status,
        start_date:   p.start_date,
        end_date:     p.end_date,
        volunteers:   signupCounts[p.id] ?? 0,
      })),
      actionItems,
    },
  });
}
