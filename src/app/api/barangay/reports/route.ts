import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// Read-only reports endpoint for barangay officials. Returns stats scoped to
// the official's assigned barangay only.

export async function GET() {
  const auth = await authorizeCapability("report.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const barangayId = auth.actor.barangayId;
  if (!barangayId) {
    return NextResponse.json({ error: "No barangay assigned to this account." }, { status: 403 });
  }

  const admin = createAdminClient();

  const [
    { data: barangay },
    { data: programs },
    { data: needs },
    { data: surveyResponses },
  ] = await Promise.all([
    admin.from("barangays")
      .select("id, name, municipality, province, partnership_start, is_active")
      .eq("id", barangayId)
      .single(),
    admin.from("programs")
      .select("id, title, status, start_date, end_date")
      .eq("barangay_id", barangayId)
      .order("start_date", { ascending: false }),
    admin.from("community_needs")
      .select("id, category, title, description, priority, created_at, resolved")
      .eq("barangay_id", barangayId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("survey_responses")
      .select("id, survey_id, submitted_at, surveys(title)")
      .eq("barangay_id", barangayId)
      .order("submitted_at", { ascending: false })
      .limit(20),
  ]);

  // Volunteer hours scoped to programs in this barangay
  const programIds = (programs ?? []).map((p) => p.id);
  let totalHours = 0;
  let totalActivities = 0;
  if (programIds.length > 0) {
    const { data: logs } = await admin
      .from("activity_logs")
      .select("hours, status")
      .in("program_id", programIds)
      .eq("status", "approved");
    totalHours = (logs ?? []).reduce((s, l) => s + (l.hours ?? 0), 0);
    totalActivities = (logs ?? []).length;
  }

  // Program-status breakdown
  const programsByStatus: Record<string, number> = {};
  for (const p of programs ?? []) {
    programsByStatus[p.status] = (programsByStatus[p.status] ?? 0) + 1;
  }

  // Needs-by-category breakdown
  const needsByCategory: Record<string, number> = {};
  for (const n of needs ?? []) {
    needsByCategory[n.category] = (needsByCategory[n.category] ?? 0) + 1;
  }

  return NextResponse.json({
    data: {
      barangay,
      summary: {
        programCount:        (programs ?? []).length,
        activeProgramCount:  programsByStatus.active ?? 0,
        completedCount:      programsByStatus.completed ?? 0,
        needsCount:          (needs ?? []).length,
        unresolvedNeeds:     (needs ?? []).filter((n) => !n.resolved).length,
        totalVolunteerHours: Math.round(totalHours * 10) / 10,
        totalActivities,
        surveyResponses:     (surveyResponses ?? []).length,
      },
      programsByStatus,
      needsByCategory,
      programs:        programs        ?? [],
      needs:           needs           ?? [],
      surveyResponses: (surveyResponses ?? []).map((r) => ({
        id:           r.id,
        survey_id:    r.survey_id,
        survey_title: (r.surveys as { title?: string } | null)?.title ?? "Untitled",
        submitted_at: r.submitted_at,
      })),
    },
  });
}
