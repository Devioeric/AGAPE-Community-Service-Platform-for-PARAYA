import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { impactInsights } from "@/lib/analytics/insights";

const headers = { "Cache-Control": "private, no-store" };

/**
 * Chart aggregates for Impact Measurement: people reached per barangay,
 * planned vs reached per program, follow-up completion by month, and the
 * linked pre/post survey pairs. Voided impact records are excluded; survey
 * pairs are listed only for actors who can open the survey comparison.
 */
export async function GET() {
  const auth = await authorizeCapability("impact.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  try {
    const admin = createAdminClient();
    const canCompare = hasCapability(auth.actor.role, auth.actor.permissions, "survey.analyze");
    const [
      { data: indicators },
      { data: stories },
      { data: followUps },
      { data: programs },
      { data: proposals },
      { data: surveys },
    ] = await Promise.all([
      admin.from("impact_indicators").select("program_id, indicator_type, value").is("voided_at", null).throwOnError(),
      admin.from("impact_qualitative").select("type").is("voided_at", null).throwOnError(),
      admin.from("follow_up_records").select("status, scheduled_date").is("voided_at", null).throwOnError(),
      admin.from("programs").select("id, title, status, project_proposal_id, proposal_id, barangays(name)").throwOnError(),
      admin.from("project_proposals").select("id, expected_beneficiary_count").throwOnError(),
      canCompare ? admin.from("surveys").select("id, title, parent_survey_id").throwOnError() : Promise.resolve({ data: [] }),
    ]);
    // Follow-ups are due by the Philippine calendar date.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    const data = impactInsights({
      indicators: indicators ?? [],
      stories: stories ?? [],
      followUps: followUps ?? [],
      programs: programs ?? [],
      proposals: proposals ?? [],
      surveys: surveys ?? [],
      today,
    });
    return NextResponse.json({ data }, { headers });
  } catch (error) {
    const denied = typeof error === "object" && error !== null && "code" in error && error.code === "42501";
    return NextResponse.json({ error: denied ? "Impact analytics access is not permitted" : "Impact analytics are temporarily unavailable" }, { status: denied ? 403 : 503, headers });
  }
}
