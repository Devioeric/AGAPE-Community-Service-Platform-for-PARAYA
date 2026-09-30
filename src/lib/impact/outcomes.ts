// Outcome roll-ups for Impact Measurement: which community needs and which SDGs
// the programs answered. Pure functions over rows the API has already loaded
// (voided SDG outcomes excluded). People reached come from the program
// summaries in ./summary, so these numbers agree with every other impact view.
import { FOCUS_SDG_NUMBERS } from "../sdg-focus.js";
import type { ProgramImpactSummary } from "./summary";

export const NEED_CATEGORIES = ["health", "livelihood", "education", "infrastructure", "environment"] as const;

export type SdgOutcomeRow = { id: string; program_id: string; sdg_goal: number; actual_indicator: string; actual_contribution: string; created_at: string };
export type NeedRow = { id: string; title: string; category: string; status: string | null; barangay_id: string | null; priority: string | null };
export type NeedLinkRow = { id: string; program_id: string; need_id: string; intended_coverage: string; source_proposal_need_link_id: string | null };

export type SdgContribution = {
  sdg: number;
  /** Programs that planned this SDG or have a recorded contribution to it. */
  programs: number;
  programsWithOutcome: number;
  /** People reached by those programs; each program counts once per SDG. */
  peopleReached: number;
  latestOutcomes: Array<{ programId: string; programTitle: string; indicator: string; contribution: string; recordedAt: string }>;
};

export type NeedCategoryContribution = {
  category: string;
  approvedNeeds: number;
  /** Approved needs linked to at least one program. */
  answered: number;
  inProgress: number;
  addressed: number;
  programs: number;
  /** People reached by the programs linked to these needs; each program counts once per category. */
  peopleReached: number;
};

export type ProgramNeed = {
  linkId: string; needId: string; title: string; category: string; status: string; priority: string | null;
  coverage: string; source: "proposal" | "manual";
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Planned SDGs from programs.sdg_alignments, kept to the four focus SDGs, in order. */
export function plannedSdgs(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return FOCUS_SDG_NUMBERS.filter((sdg) => value.some((item) => Number(item) === sdg));
}

export function summarizeSdgContribution(input: {
  programs: ProgramImpactSummary[];
  planned: Map<string, number[]>;
  outcomes: SdgOutcomeRow[];
  latest?: number;
}): SdgContribution[] {
  const byId = new Map(input.programs.map((program) => [program.programId, program]));
  const latest = input.latest ?? 3;
  return FOCUS_SDG_NUMBERS.map((sdg) => {
    const outcomes = input.outcomes
      .filter((row) => row.sdg_goal === sdg && byId.has(row.program_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const withOutcome = new Set(outcomes.map((row) => row.program_id));
    const contributing = new Set(withOutcome);
    input.planned.forEach((sdgs, programId) => { if (byId.has(programId) && sdgs.includes(sdg)) contributing.add(programId); });
    const peopleReached = Array.from(contributing).reduce((sum, programId) => sum + (byId.get(programId)?.reached ?? 0), 0);
    return {
      sdg,
      programs: contributing.size,
      programsWithOutcome: withOutcome.size,
      peopleReached: round1(peopleReached),
      latestOutcomes: outcomes.slice(0, latest).map((row) => ({
        programId: row.program_id,
        programTitle: byId.get(row.program_id)?.title ?? "Program",
        indicator: row.actual_indicator,
        contribution: row.actual_contribution,
        recordedAt: row.created_at,
      })),
    };
  });
}

/** One row per need category (the five intake categories first), for approved needs only. */
export function summarizeNeedCategories(input: { needs: NeedRow[]; links: NeedLinkRow[]; programs: ProgramImpactSummary[] }): NeedCategoryContribution[] {
  const byId = new Map(input.programs.map((program) => [program.programId, program]));
  const programsByNeed = new Map<string, Set<string>>();
  for (const link of input.links) {
    if (!byId.has(link.program_id)) continue;
    const set = programsByNeed.get(link.need_id) ?? new Set<string>();
    set.add(link.program_id);
    programsByNeed.set(link.need_id, set);
  }
  const categories: string[] = [...NEED_CATEGORIES];
  for (const need of input.needs) if (!categories.includes(need.category)) categories.push(need.category);
  return categories.map((category) => {
    const needs = input.needs.filter((need) => need.category === category);
    const programs = new Set<string>();
    for (const need of needs) programsByNeed.get(need.id)?.forEach((programId) => programs.add(programId));
    return {
      category,
      approvedNeeds: needs.length,
      answered: needs.filter((need) => programsByNeed.has(need.id)).length,
      inProgress: needs.filter((need) => need.status === "in_progress").length,
      addressed: needs.filter((need) => need.status === "addressed").length,
      programs: programs.size,
      peopleReached: round1(Array.from(programs).reduce((sum, programId) => sum + (byId.get(programId)?.reached ?? 0), 0)),
    };
  });
}

/** The needs one program answers, with how they were linked. */
export function programNeeds(programId: string, needs: NeedRow[], links: NeedLinkRow[]): ProgramNeed[] {
  const byId = new Map(needs.map((need) => [need.id, need]));
  return links
    .filter((link) => link.program_id === programId && byId.has(link.need_id))
    .map((link) => {
      const need = byId.get(link.need_id)!;
      return {
        linkId: link.id, needId: need.id, title: need.title, category: need.category, status: need.status ?? "identified",
        priority: need.priority, coverage: link.intended_coverage,
        source: link.source_proposal_need_link_id ? "proposal" as const : "manual" as const,
      };
    });
}
