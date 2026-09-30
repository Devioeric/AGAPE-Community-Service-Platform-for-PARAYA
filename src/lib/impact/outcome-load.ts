import { createAdminClient } from "@/lib/supabase/admin";
import { communityProfileDataSchema } from "@/lib/community-profile/schema";
import { profileTarget, targetValue, type TargetValue } from "@/lib/community-profile/targets";
import { plannedSdgs, type NeedLinkRow, type NeedRow, type SdgOutcomeRow } from "./outcomes";

/**
 * The outcome side of impact: planned SDGs and target figures per program,
 * recorded SDG contributions (voided ones excluded), program-need links, and
 * approved community needs. Callers have already checked impact.read.
 */
export async function loadOutcomeRows(admin = createAdminClient()) {
  const [programs, outcomes, links, needs] = await Promise.all([
    admin.from("programs").select("id, sdg_alignments, target_profile_figure").limit(5000).throwOnError(),
    admin.from("program_sdg_outcomes").select("id, program_id, sdg_goal, actual_indicator, actual_contribution, created_at").is("voided_at", null).limit(20000).throwOnError(),
    admin.from("program_need_links_v2").select("id, program_id, need_id, intended_coverage, source_proposal_need_link_id").limit(20000).throwOnError(),
    admin.from("community_needs").select("id, title, category, status, barangay_id, priority").eq("approval_status", "approved").limit(5000).throwOnError(),
  ]);
  const programRows = (programs.data ?? []) as Array<{ id: string; sdg_alignments: unknown; target_profile_figure: string | null }>;
  return {
    planned: new Map(programRows.map((row) => [row.id, plannedSdgs(row.sdg_alignments)])),
    targets: new Map(programRows.map((row) => [row.id, row.target_profile_figure])),
    outcomes: (outcomes.data ?? []) as SdgOutcomeRow[],
    links: (links.data ?? []) as NeedLinkRow[],
    needs: (needs.data ?? []) as NeedRow[],
  };
}

export type TargetFigure = {
  key: string; label: string; needCategory: string | null;
  /** The barangay's current value; null when it has no profile or the reader cannot see profiles. */
  current: (TargetValue & { asOf: string }) | null;
};

/** Current values of target figures in one barangay's community profile. */
export async function loadTargetFigures(admin: ReturnType<typeof createAdminClient>, barangayId: string | null, keys: Array<string | null>, canReadProfile: boolean): Promise<TargetFigure[]> {
  const targets = Array.from(new Set(keys.filter((key): key is string => Boolean(key)))).map(profileTarget).filter((target) => target !== null);
  if (targets.length === 0) return [];
  let profile: { data: unknown; updated_at: string } | null = null;
  if (canReadProfile && barangayId) {
    const result = await admin.from("barangay_community_profiles").select("data, updated_at").eq("barangay_id", barangayId).maybeSingle().throwOnError();
    profile = result.data as { data: unknown; updated_at: string } | null;
  }
  const parsed = profile ? communityProfileDataSchema.safeParse(profile.data) : null;
  return targets.map((target) => ({
    key: target.key,
    label: target.label,
    needCategory: target.needCategory,
    current: profile && parsed?.success ? { ...targetValue(target, parsed.data), asOf: profile.updated_at } : null,
  }));
}
