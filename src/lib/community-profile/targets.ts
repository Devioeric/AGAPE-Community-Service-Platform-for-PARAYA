// Community profile figures a program can aim to change. Optional on a program:
// many programs do not come from a profiled need. Every figure is "lower is
// better", so a later profile showing a smaller share means improvement.
// Keys are stored on programs.target_profile_figure: never rename or reuse one.
import { PROFILE_INDICATORS } from "./catalog";
import type { CommunityProfileData } from "./schema";
import { indicatorTotal, share } from "./stats";

export type ProfileTarget = {
  key: string;
  label: string;
  indicator: string;
  categories: readonly string[];
  /** The community-need category the figure belongs to; null when it spans several. */
  needCategory: "health" | "livelihood" | "education" | "infrastructure" | "environment" | null;
};

export const PROFILE_TARGETS: readonly ProfileTarget[] = [
  { key: "low_income", label: "Income below ₱10,000", indicator: "monthly_income", categories: ["below_5000", "from_5000"], needCategory: "livelihood" },
  { key: "income_insufficient", label: "Income not enough for the household", indicator: "income_sufficiency", categories: ["insufficient"], needCategory: "livelihood" },
  { key: "no_home_garden", label: "No household garden", indicator: "gardening", categories: ["none"], needCategory: "livelihood" },
  { key: "no_internet", label: "Without internet", indicator: "internet", categories: ["no"], needCategory: "education" },
  { key: "no_devices", label: "No digital devices", indicator: "devices", categories: ["none"], needCategory: "education" },
  { key: "no_education", label: "No educational background", indicator: "education", categories: ["no_education"], needCategory: "education" },
  { key: "nutrition_concern", label: "Nutritional concerns", indicator: "nutrition_concern", categories: ["yes"], needCategory: "health" },
  { key: "no_health_insurance", label: "No health insurance", indicator: "health_insurance", categories: ["none"], needCategory: "health" },
  { key: "no_healthcare_access", label: "No access to healthcare", indicator: "healthcare_access", categories: ["no"], needCategory: "health" },
  { key: "unmet_medical_cost", label: "Unmet medical needs because of cost", indicator: "unmet_medical_needs", categories: ["financial"], needCategory: "health" },
  { key: "no_toilet", label: "No toilet or a shared one", indicator: "toilet", categories: ["none", "shared"], needCategory: "infrastructure" },
  { key: "no_flood_monitoring", label: "No flood monitoring", indicator: "flood_monitoring", categories: ["none"], needCategory: "environment" },
  { key: "waste_burned", label: "Waste burned or dumped", indicator: "waste_disposal", categories: ["burned", "open_dumping"], needCategory: "environment" },
  { key: "no_community_org", label: "Not in any community organization", indicator: "community_organization", categories: ["none"], needCategory: null },
];

export const PROFILE_TARGET_KEYS: ReadonlySet<string> = new Set(PROFILE_TARGETS.map((target) => target.key));

export function profileTarget(key: string | null | undefined): ProfileTarget | null {
  return PROFILE_TARGETS.find((target) => target.key === key) ?? null;
}

export type TargetValue = { percent: number | null; count: number | null; total: number | null; base: string };

/** The figure's current value in one profile, computed like the profile view (share of that table's total). */
export function targetValue(target: ProfileTarget, data: CommunityProfileData): TargetValue {
  const indicator = PROFILE_INDICATORS.find((item) => item.key === target.indicator);
  const value = data[target.indicator];
  const total = indicatorTotal(value);
  const count = value && total !== null ? target.categories.reduce((sum, key) => sum + (value.counts[key] ?? 0), 0) : null;
  const base = indicator?.response === "multiple" ? "answers" : indicator?.unit === "individuals" ? "household members" : "surveyed households";
  return { percent: share(value, target.categories), count, total, base };
}
