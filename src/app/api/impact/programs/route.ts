import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { IMPACT_HEADERS, impactFailure, loadImpactRows, manilaToday } from "@/lib/impact/load";
import { summarizePrograms } from "@/lib/impact/summary";

/** One impact summary per program: reach against target, outputs, stories, follow-ups, and flags. */
export async function GET() {
  const auth = await authorizeCapability("impact.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: IMPACT_HEADERS });
  try {
    const rows = await loadImpactRows();
    return NextResponse.json({ data: summarizePrograms({ ...rows, today: manilaToday() }) }, { headers: IMPACT_HEADERS });
  } catch (error) {
    const failure = impactFailure(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: IMPACT_HEADERS });
  }
}
