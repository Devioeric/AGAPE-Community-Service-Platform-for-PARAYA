// Per-program and per-barangay impact summaries. Pure functions: the API routes
// load the rows (voided records already excluded) and the pages only render.
// "People reached" and follow-up states use the same rules as the Overview
// charts (isBeneficiaryIndicator, followUpState), so every number agrees.
import { followUpState, isBeneficiaryIndicator } from "../analytics/insights";

export type ImpactFlag = "no_results" | "overdue_follow_up" | "below_target";
export type FollowUpCounts = { total: number; completed: number; upcoming: number; overdue: number };

export type ProgramRow = {
  id: string; title: string | null; status: string | null; start_date: string | null; end_date: string | null;
  barangay_id: string | null; project_proposal_id?: string | null; proposal_id?: string | null;
};
export type IndicatorRow = { program_id: string | null; indicator_type: string | null; value: number | string | null; unit: string | null; recorded_date: string | null };
export type StoryRow = { program_id: string | null; recorded_date: string | null };
export type FollowUpRow = { program_id: string | null; status: string | null; scheduled_date: string | null };
export type ProposalRow = { id: string; expected_beneficiary_count: number | null };
export type BarangayRow = { id: string; name: string };

export type ProgramImpactSummary = {
  programId: string; title: string; status: string; startDate: string | null; endDate: string | null;
  barangayId: string | null; barangayName: string | null;
  /** Expected beneficiaries from the program's approved proposal; null when there is none. */
  planned: number | null;
  reached: number;
  reachPercent: number | null;
  indicatorCount: number;
  /** Non-beneficiary indicators, totalled by type and unit (e.g. trainings conducted, sessions). */
  outputs: Array<{ type: string; unit: string; total: number }>;
  stories: number;
  followUps: FollowUpCounts;
  lastRecorded: string | null;
  flags: ImpactFlag[];
};

export type BarangayImpactSummary = {
  barangayId: string; name: string;
  programs: number; measuredPrograms: number; completedPrograms: number;
  reached: number; stories: number; followUps: FollowUpCounts;
  lastRecorded: string | null;
  /** Programs with at least one flag. */
  flaggedPrograms: number;
};

/** A completed program below this share of its target is flagged. */
export const BELOW_TARGET_SHARE = 0.5;

const toNumber = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
};
const round1 = (value: number) => Math.round(value * 10) / 10;
const later = (current: string | null, next: string | null | undefined) => (!next ? current : !current || next > current ? next : current);
const emptyFollowUps = (): FollowUpCounts => ({ total: 0, completed: 0, upcoming: 0, overdue: 0 });

export function summarizePrograms(input: {
  programs: ProgramRow[]; indicators: IndicatorRow[]; stories: StoryRow[]; followUps: FollowUpRow[];
  proposals: ProposalRow[]; barangays: BarangayRow[];
  /** Philippine calendar date (YYYY-MM-DD); follow-ups before it are overdue. */
  today: string;
}): ProgramImpactSummary[] {
  const planned = new Map(input.proposals.map((proposal) => [proposal.id, proposal.expected_beneficiary_count]));
  const names = new Map(input.barangays.map((barangay) => [barangay.id, barangay.name]));
  const summaries = new Map<string, ProgramImpactSummary>();
  const outputs = new Map<string, Map<string, { type: string; unit: string; total: number }>>();

  for (const program of input.programs) {
    const proposalId = program.project_proposal_id ?? program.proposal_id ?? null;
    const target = proposalId ? planned.get(proposalId) ?? null : null;
    summaries.set(program.id, {
      programId: program.id,
      title: program.title?.trim() || "Untitled program",
      status: program.status ?? "draft",
      startDate: program.start_date, endDate: program.end_date,
      barangayId: program.barangay_id,
      barangayName: program.barangay_id ? names.get(program.barangay_id) ?? null : null,
      planned: target && target > 0 ? target : null,
      reached: 0, reachPercent: null, indicatorCount: 0, outputs: [], stories: 0,
      followUps: emptyFollowUps(), lastRecorded: null, flags: [],
    });
    outputs.set(program.id, new Map());
  }

  for (const row of input.indicators) {
    const summary = row.program_id ? summaries.get(row.program_id) : undefined;
    if (!summary) continue;
    const value = Math.max(0, toNumber(row.value));
    summary.indicatorCount += 1;
    summary.lastRecorded = later(summary.lastRecorded, row.recorded_date);
    if (isBeneficiaryIndicator(row.indicator_type)) { summary.reached += value; continue; }
    const type = row.indicator_type?.trim() || "custom";
    const unit = row.unit?.trim() || "";
    const byType = outputs.get(summary.programId)!;
    const entry = byType.get(`${type}|${unit}`) ?? { type, unit, total: 0 };
    entry.total += value;
    byType.set(`${type}|${unit}`, entry);
  }

  for (const row of input.stories) {
    const summary = row.program_id ? summaries.get(row.program_id) : undefined;
    if (!summary) continue;
    summary.stories += 1;
    summary.lastRecorded = later(summary.lastRecorded, row.recorded_date);
  }

  for (const row of input.followUps) {
    const summary = row.program_id ? summaries.get(row.program_id) : undefined;
    if (!summary) continue;
    const state = followUpState(row, input.today);
    if (state === "cancelled") continue;
    summary.followUps.total += 1;
    summary.followUps[state] += 1;
  }

  return Array.from(summaries.values()).map((summary) => {
    const reached = round1(summary.reached);
    const reachPercent = summary.planned ? round1((reached / summary.planned) * 100) : null;
    const flags: ImpactFlag[] = [];
    if (summary.status === "completed" && summary.indicatorCount === 0) flags.push("no_results");
    if (summary.followUps.overdue > 0) flags.push("overdue_follow_up");
    if (summary.status === "completed" && summary.planned && summary.indicatorCount > 0 && reached < summary.planned * BELOW_TARGET_SHARE) flags.push("below_target");
    return {
      ...summary,
      reached,
      reachPercent,
      outputs: Array.from(outputs.get(summary.programId)!.values())
        .map((entry) => ({ ...entry, total: round1(entry.total) }))
        .sort((a, b) => a.type.localeCompare(b.type)),
      flags,
    };
  });
}

/** Every barangay in the list appears, including those with no programs yet. */
export function summarizeBarangays(programs: ProgramImpactSummary[], barangays: BarangayRow[]): BarangayImpactSummary[] {
  return barangays.map((barangay) => {
    const own = programs.filter((program) => program.barangayId === barangay.id);
    const followUps = emptyFollowUps();
    let lastRecorded: string | null = null;
    for (const program of own) {
      followUps.total += program.followUps.total;
      followUps.completed += program.followUps.completed;
      followUps.upcoming += program.followUps.upcoming;
      followUps.overdue += program.followUps.overdue;
      lastRecorded = later(lastRecorded, program.lastRecorded);
    }
    return {
      barangayId: barangay.id,
      name: barangay.name,
      programs: own.length,
      measuredPrograms: own.filter((program) => program.indicatorCount > 0).length,
      completedPrograms: own.filter((program) => program.status === "completed").length,
      reached: round1(own.reduce((sum, program) => sum + program.reached, 0)),
      stories: own.reduce((sum, program) => sum + program.stories, 0),
      followUps,
      lastRecorded,
      flaggedPrograms: own.filter((program) => program.flags.length > 0).length,
    };
  });
}

export const IMPACT_FLAG_LABEL: Record<ImpactFlag, string> = {
  no_results: "Completed, no results recorded",
  overdue_follow_up: "Follow-up overdue",
  below_target: "Reached under half its target",
};
