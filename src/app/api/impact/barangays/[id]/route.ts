import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { followUpState } from "@/lib/analytics/insights";
import { createAdminClient } from "@/lib/supabase/admin";
import { communityProfileDataSchema } from "@/lib/community-profile/schema";
import { keyFigures } from "@/lib/community-profile/server";
import { IMPACT_HEADERS, impactFailure, loadImpactRows, manilaToday } from "@/lib/impact/load";
import { loadOutcomeRows, loadTargetFigures } from "@/lib/impact/outcome-load";
import { summarizeNeedCategories, summarizeSdgContribution } from "@/lib/impact/outcomes";
import { summarizeBarangays, summarizePrograms } from "@/lib/impact/summary";

const idSchema = z.string().uuid();

/**
 * One barangay's impact: its summary, each program's summary, recent stories,
 * open follow-ups, context (community profile key figures and approved needs),
 * its contribution by SDG and need category, and the profile figures its
 * programs aim to lower. Profile figures are included only for readers with
 * profiling.aggregate.read.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("impact.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: IMPACT_HEADERS });
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Barangay not found" }, { status: 404, headers: IMPACT_HEADERS });
  const canReadProfile = hasCapability(auth.actor.role, auth.actor.permissions, "profiling.aggregate.read");
  try {
    const admin = createAdminClient();
    const today = manilaToday();
    const [rows, outcome] = await Promise.all([loadImpactRows(admin), loadOutcomeRows(admin)]);
    const barangay = rows.barangays.find((row) => row.id === id);
    if (!barangay) return NextResponse.json({ error: "Barangay not found" }, { status: 404, headers: IMPACT_HEADERS });
    // Same order as the Programs tab: flagged first, then the most recent start date.
    const programs = summarizePrograms({ ...rows, today })
      .filter((program) => program.barangayId === id)
      .sort((a, b) => (b.flags.length > 0 ? 1 : 0) - (a.flags.length > 0 ? 1 : 0) || (b.startDate ?? "").localeCompare(a.startDate ?? ""));
    const programIds = programs.map((program) => program.programId);
    const titles = new Map(programs.map((program) => [program.programId, program.title]));
    const none = Promise.resolve({ data: [] as Array<Record<string, unknown>> });
    const [stories, followUps, profile, needs, targets] = await Promise.all([
      programIds.length
        ? admin.from("impact_qualitative").select("id, program_id, type, content, recorded_date").in("program_id", programIds).is("voided_at", null).order("recorded_date", { ascending: false }).limit(6).throwOnError()
        : none,
      programIds.length
        ? admin.from("follow_up_records").select("id, program_id, followup_type, scheduled_date, status").in("program_id", programIds).is("voided_at", null).in("status", ["scheduled", "in_progress", "overdue"]).order("scheduled_date", { ascending: true }).limit(10).throwOnError()
        : none,
      canReadProfile
        ? admin.from("barangay_community_profiles").select("coverage, respondent_households, data").eq("barangay_id", id).maybeSingle().throwOnError()
        : Promise.resolve({ data: null }),
      admin.from("community_needs").select("status").eq("barangay_id", id).eq("approval_status", "approved").limit(5000).throwOnError(),
      loadTargetFigures(admin, id, programIds.map((programId) => outcome.targets.get(programId) ?? null), canReadProfile),
    ]);
    const profileRow = profile.data as { coverage: string | null; respondent_households: number | null; data: unknown } | null;
    const parsedProfile = profileRow ? communityProfileDataSchema.safeParse(profileRow.data) : null;
    const approvedNeeds = (needs.data ?? []) as Array<{ status: string | null }>;
    return NextResponse.json({
      data: {
        summary: summarizeBarangays(programs, [barangay])[0],
        programs,
        stories: (stories.data ?? []).map((row) => ({ ...row, program_title: titles.get(String(row.program_id)) ?? "Program" })),
        followUps: (followUps.data ?? []).map((row) => ({
          ...row,
          program_title: titles.get(String(row.program_id)) ?? "Program",
          state: followUpState(row as { status?: string | null; scheduled_date?: string | null }, today),
        })),
        context: {
          profile: profileRow && parsedProfile?.success
            ? { coverage: profileRow.coverage, respondentHouseholds: profileRow.respondent_households, keyFigures: keyFigures(parsedProfile.data) }
            : null,
          // Lets the page tell "no profile yet" apart from "not visible to this role".
          profileAccess: canReadProfile,
          needs: { approved: approvedNeeds.length, addressed: approvedNeeds.filter((need) => need.status === "addressed").length },
        },
        contribution: {
          sdgs: summarizeSdgContribution({ programs, planned: outcome.planned, outcomes: outcome.outcomes }),
          categories: summarizeNeedCategories({ needs: outcome.needs.filter((need) => need.barangay_id === id), links: outcome.links, programs }),
        },
        // Profile figures this barangay's programs aim to lower, with the programs aiming at each.
        targets: targets.map((target) => ({
          ...target,
          programs: programs
            .filter((program) => outcome.targets.get(program.programId) === target.key)
            .map((program) => ({ id: program.programId, title: program.title })),
        })),
      },
    }, { headers: IMPACT_HEADERS });
  } catch (error) {
    const failure = impactFailure(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: IMPACT_HEADERS });
  }
}
