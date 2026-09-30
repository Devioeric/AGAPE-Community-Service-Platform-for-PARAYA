import { createAdminClient } from "@/lib/supabase/admin";
import type { BarangayRow, FollowUpRow, IndicatorRow, ProgramRow, ProposalRow, StoryRow } from "./summary";

export const IMPACT_HEADERS = { "Cache-Control": "private, no-store" };

/** Follow-ups are due by the Philippine calendar date. */
export function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/**
 * Every row the impact summaries need, voided records excluded. Callers have
 * already checked impact.read; the service client only reads.
 */
export async function loadImpactRows(admin = createAdminClient()) {
  const [programs, indicators, stories, followUps, proposals, barangays] = await Promise.all([
    admin.from("programs").select("id, title, status, start_date, end_date, barangay_id, project_proposal_id, proposal_id").limit(5000).throwOnError(),
    admin.from("impact_indicators").select("program_id, indicator_type, value, unit, recorded_date").is("voided_at", null).limit(20000).throwOnError(),
    admin.from("impact_qualitative").select("program_id, recorded_date").is("voided_at", null).limit(20000).throwOnError(),
    admin.from("follow_up_records").select("program_id, status, scheduled_date").is("voided_at", null).limit(20000).throwOnError(),
    admin.from("project_proposals").select("id, expected_beneficiary_count").limit(5000).throwOnError(),
    admin.from("barangays").select("id, name").eq("is_active", true).order("name").throwOnError(),
  ]);
  return {
    programs: (programs.data ?? []) as ProgramRow[],
    indicators: (indicators.data ?? []) as IndicatorRow[],
    stories: (stories.data ?? []) as StoryRow[],
    followUps: (followUps.data ?? []) as FollowUpRow[],
    proposals: (proposals.data ?? []) as ProposalRow[],
    barangays: (barangays.data ?? []) as BarangayRow[],
  };
}

export function impactFailure(error: unknown) {
  const denied = typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "42501";
  return { status: denied ? 403 : 503, error: denied ? "Impact data access is not permitted" : "Impact data is temporarily unavailable" };
}
