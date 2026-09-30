import { formatPercent, indicatorTotal, share } from "./stats";
import type { CommunityProfileData } from "./schema";

export const PROFILE_SIGNAL_POLICY = "cna.profile-signals.v1";

/** A signal fires at `threshold` percent; it is high priority at `high` percent. */
export const PROFILE_SIGNAL_RULES = [
  { code: "low_income", title: "Low household income", category: "livelihood", indicator: "monthly_income", categories: ["below_5000", "from_5000"], threshold: 30, high: 40, phrase: "of surveyed households earn below ₱10,000 a month" },
  { code: "flood_prone", title: "Flood exposure", category: "environment", indicator: "flood_exposure", categories: ["flood_prone"], threshold: 30, high: 50, phrase: "of surveyed households live in flood-prone areas" },
  { code: "no_internet", title: "No internet access", category: "education", indicator: "internet", categories: ["no"], threshold: 25, high: 50, phrase: "of surveyed households have no internet access" },
  { code: "nutrition_concern", title: "Nutritional concerns", category: "health", indicator: "nutrition_concern", categories: ["yes"], threshold: 15, high: 30, phrase: "of surveyed households report nutritional concerns" },
  { code: "no_health_insurance", title: "No health insurance", category: "health", indicator: "health_insurance", categories: ["none"], threshold: 40, high: 60, phrase: "of health-insurance answers report no coverage" },
] as const;

export type ProfileSignal = {
  code: string; title: string; category: string; indicator: string; priority: "medium" | "high";
  percent: number; count: number; total: number; description: string; affectedCount: number | null;
};

export function evaluateProfileSignals(data: CommunityProfileData): ProfileSignal[] {
  const signals: ProfileSignal[] = [];
  for (const rule of PROFILE_SIGNAL_RULES) {
    const value = data[rule.indicator];
    const total = indicatorTotal(value);
    const percent = share(value, rule.categories);
    if (!value || total === null || percent === null || percent < rule.threshold) continue;
    const count = rule.categories.reduce((sum, key) => sum + (value.counts[key] ?? 0), 0);
    signals.push({
      code: rule.code, title: rule.title, category: rule.category, indicator: rule.indicator,
      priority: percent >= rule.high ? "high" : "medium", percent, count, total,
      description: `${formatPercent(percent)} ${rule.phrase} (${count} of ${total}).`,
      // Multiple-response tables count answers, not households.
      affectedCount: rule.code === "no_health_insurance" ? null : count,
    });
  }
  return signals;
}
