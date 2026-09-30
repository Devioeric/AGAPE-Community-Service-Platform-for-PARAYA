import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPACT_HEADERS, impactFailure, loadImpactRows, manilaToday } from "@/lib/impact/load";
import { loadOutcomeRows } from "@/lib/impact/outcome-load";
import { summarizeNeedCategories, summarizeSdgContribution } from "@/lib/impact/outcomes";
import { summarizePrograms } from "@/lib/impact/summary";

/** Overview roll-ups: contribution per focus SDG and per community-need category. */
export async function GET() {
  const auth = await authorizeCapability("impact.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: IMPACT_HEADERS });
  try {
    const admin = createAdminClient();
    const [rows, outcome] = await Promise.all([loadImpactRows(admin), loadOutcomeRows(admin)]);
    const programs = summarizePrograms({ ...rows, today: manilaToday() });
    return NextResponse.json({
      data: {
        sdgs: summarizeSdgContribution({ programs, planned: outcome.planned, outcomes: outcome.outcomes }),
        categories: summarizeNeedCategories({ needs: outcome.needs, links: outcome.links, programs }),
      },
    }, { headers: IMPACT_HEADERS });
  } catch (error) {
    const failure = impactFailure(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: IMPACT_HEADERS });
  }
}
