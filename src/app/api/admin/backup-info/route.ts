import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";

// Supabase Pro automatically takes daily backups (7-day rolling window) — see
// https://supabase.com/docs/guides/platform/backups. This endpoint returns
// system stats so the admin Backup page can show real values instead of
// fabricated ones.

export async function GET() {
  const auth = await authorizeCapability("admin.recovery.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();

  // Row counts across the largest tables — gives a feel for DB usage.
  const tables = [
    "users", "barangays", "partnership_history",
    "programs", "program_signups", "activity_logs",
    "project_proposals", "proposal_reviews", "proposal_sdg_alignment",
    "community_needs", "household_profiles",
    "surveys", "survey_questions", "survey_responses", "survey_answers",
    "donations", "donation_distributions",
    "impact_indicators", "impact_qualitative", "follow_up_records",
    "audit_logs", "notifications",
    "barangay_skills", "barangay_assets", "volunteer_class_schedules",
  ];

  const counts: Record<string, number> = {};
  let totalRows = 0;

  await Promise.all(tables.map(async (t) => {
    const { count } = await admin.from(t).select("*", { count: "exact", head: true });
    const n = count ?? 0;
    counts[t] = n;
    totalRows += n;
  }));

  // Last audit log gives a rough "last write" timestamp
  const { data: lastWrite } = await admin
    .from("audit_logs")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    data: {
      totalRows,
      counts,
      lastWriteAt:    lastWrite?.created_at ?? null,
      // Static config — Supabase Pro: daily auto backups, 7-day retention
      backupProvider: "Supabase",
      backupPolicy:   "Daily automatic backups (7-day rolling retention on Pro tier)",
    },
  });
}
