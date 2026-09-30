import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { followUpState } from "@/lib/analytics/insights";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPACT_HEADERS, impactFailure, loadImpactRows, manilaToday } from "@/lib/impact/load";
import { loadOutcomeRows, loadTargetFigures } from "@/lib/impact/outcome-load";
import { programNeeds } from "@/lib/impact/outcomes";
import { summarizePrograms } from "@/lib/impact/summary";

const idSchema = z.string().uuid();

/**
 * One program's impact: its summary, every non-voided record, and its impact
 * chain (the needs it answers, planned and recorded SDG contributions, and the
 * community profile figure it aims to lower). Stories never include the
 * subject's name; the page shows the story text only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("impact.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: IMPACT_HEADERS });
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Program not found" }, { status: 404, headers: IMPACT_HEADERS });
  const canReadProfile = hasCapability(auth.actor.role, auth.actor.permissions, "profiling.aggregate.read");
  try {
    const admin = createAdminClient();
    const today = manilaToday();
    const [rows, outcome, indicators, stories, followUps] = await Promise.all([
      loadImpactRows(admin),
      loadOutcomeRows(admin),
      admin.from("impact_indicators").select("id, indicator_type, value, unit, recorded_date, notes").eq("program_id", id).is("voided_at", null).order("recorded_date", { ascending: false }).throwOnError(),
      admin.from("impact_qualitative").select("id, type, content, recorded_date").eq("program_id", id).is("voided_at", null).order("recorded_date", { ascending: false }).throwOnError(),
      admin.from("follow_up_records").select("id, followup_type, scheduled_date, status, completed_date, notes").eq("program_id", id).is("voided_at", null).order("scheduled_date", { ascending: true }).throwOnError(),
    ]);
    const summary = summarizePrograms({ ...rows, today }).find((program) => program.programId === id);
    if (!summary) return NextResponse.json({ error: "Program not found" }, { status: 404, headers: IMPACT_HEADERS });
    const [target] = await loadTargetFigures(admin, summary.barangayId, [outcome.targets.get(id) ?? null], canReadProfile);
    return NextResponse.json({
      data: {
        summary,
        indicators: indicators.data ?? [],
        stories: stories.data ?? [],
        followUps: (followUps.data ?? []).map((row) => ({ ...row, state: followUpState(row, today) })),
        chain: {
          needs: programNeeds(id, outcome.needs, outcome.links),
          plannedSdgs: outcome.planned.get(id) ?? [],
          sdgOutcomes: outcome.outcomes
            .filter((row) => row.program_id === id)
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
          target: target ?? null,
          profileAccess: canReadProfile,
        },
      },
    }, { headers: IMPACT_HEADERS });
  } catch (error) {
    const failure = impactFailure(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: IMPACT_HEADERS });
  }
}
