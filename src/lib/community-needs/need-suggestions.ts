import { createHash } from "node:crypto";
import { z } from "zod";
import { needCategorySchema } from "@/lib/ai/advisory-recommendations";
import { suppressedCountSchema } from "@/lib/profiling/privacy";

/** Codes are deliberately stable: they are the durable key for a cycle decision. */
export const NEED_INDICATOR_CODES = [
  "hh_water_unimproved", "hh_sanitation_limited", "hh_no_electricity",
  "hh_housing_inadequate", "hh_flood_exposed", "hh_no_digital_access",
  "hh_low_income", "hh_need_health", "hh_need_education", "hh_need_livelihood",
  "hh_need_housing", "hh_need_sanitation", "hh_need_disaster_readiness",
  "hh_need_digital_access", "res_school_age_not_enrolled", "res_labor_force_unemployed",
  "res_disability_support", "res_health_support",
] as const;
export type NeedIndicatorCode = typeof NEED_INDICATOR_CODES[number];
export type NeedCategory = z.infer<typeof needCategorySchema>;

const indicatorPairSchema = z.object({
  code: z.enum(NEED_INDICATOR_CODES),
  unit: z.enum(["household", "resident"]),
  base: suppressedCountSchema,
  yes: suppressedCountSchema,
  no: suppressedCountSchema,
}).strict();

export const needIndicatorDocumentSchema = z.object({
  schemaVersion: z.literal("agape.profiling.need-indicators.v1"),
  cycle: z.object({
    id: z.string().uuid(), barangayId: z.string().uuid(),
    name: z.string().trim().min(2).max(160),
    status: z.enum(["completed", "archived"]), reportingDate: z.string().date(),
  }).strict(),
  sample: z.object({ approvedHouseholds: z.number().int().nonnegative(), approvedResidents: z.number().int().nonnegative() }).strict(),
  privacy: z.object({ suppressionThreshold: z.number().int().min(5).max(100), complementarySuppression: z.literal(true) }).strict(),
  asOf: z.string().min(1).max(80),
  indicators: z.array(indicatorPairSchema).length(18).superRefine((items, context) => {
    if (new Set(items.map((item) => item.code)).size !== items.length) context.addIssue({ code: "custom", message: "indicator codes must be unique" });
  }),
  evidenceSnapshotId: z.string().uuid(),
}).strict();
export type NeedIndicatorDocument = z.infer<typeof needIndicatorDocumentSchema>;
export type SuppressedCount = z.infer<typeof suppressedCountSchema>;

type IndicatorRule = {
  unit: "household" | "resident"; category: NeedCategory; threshold: number; highThreshold: number;
  title: string; baseNoun: string; predicate: string;
};

export const NEED_SUGGESTION_POLICY = {
  version: "cna.need-suggestions.v1",
  minBase: 20, highConfidenceBase: 100, moderateConfidenceBase: 30,
  rules: {
    hh_water_unimproved: { unit: "household", category: "infrastructure", threshold: 25, highThreshold: 50, title: "Limited access to piped or well water", baseNoun: "sampled households", predicate: "rely on delivered, communal, or other non-piped water" },
    hh_sanitation_limited: { unit: "household", category: "infrastructure", threshold: 25, highThreshold: 50, title: "Limited household sanitation facilities", baseNoun: "sampled households", predicate: "use shared, latrine, or no toilet facilities" },
    hh_no_electricity: { unit: "household", category: "infrastructure", threshold: 10, highThreshold: 25, title: "Households without electricity", baseNoun: "sampled households", predicate: "have no electricity connection" },
    hh_housing_inadequate: { unit: "household", category: "infrastructure", threshold: 20, highThreshold: 40, title: "Housing that needs major repair", baseNoun: "sampled households", predicate: "live in housing that needs major repair or is temporary" },
    hh_flood_exposed: { unit: "household", category: "environment", threshold: 30, highThreshold: 60, title: "Flood exposure and disaster readiness", baseNoun: "sampled households", predicate: "reported flooding as a hazard" },
    hh_no_digital_access: { unit: "household", category: "education", threshold: 30, highThreshold: 60, title: "Limited digital access", baseNoun: "sampled households with a stated internet status", predicate: "have no internet access and no smartphone, tablet, or computer" },
    hh_low_income: { unit: "household", category: "livelihood", threshold: 40, highThreshold: 60, title: "Low household income", baseNoun: "sampled households with a stated income", predicate: "report a monthly household income below ₱10,000" },
    hh_need_health: { unit: "household", category: "health", threshold: 30, highThreshold: 60, title: "Household-reported health needs", baseNoun: "sampled households", predicate: "named health as a household need" },
    hh_need_education: { unit: "household", category: "education", threshold: 30, highThreshold: 60, title: "Household-reported education needs", baseNoun: "sampled households", predicate: "named education as a household need" },
    hh_need_livelihood: { unit: "household", category: "livelihood", threshold: 30, highThreshold: 60, title: "Household-reported livelihood needs", baseNoun: "sampled households", predicate: "named livelihood as a household need" },
    hh_need_housing: { unit: "household", category: "infrastructure", threshold: 30, highThreshold: 60, title: "Household-reported housing needs", baseNoun: "sampled households", predicate: "named housing as a household need" },
    hh_need_sanitation: { unit: "household", category: "infrastructure", threshold: 30, highThreshold: 60, title: "Household-reported sanitation needs", baseNoun: "sampled households", predicate: "named sanitation as a household need" },
    hh_need_disaster_readiness: { unit: "household", category: "environment", threshold: 30, highThreshold: 60, title: "Household-reported disaster-readiness needs", baseNoun: "sampled households", predicate: "named disaster readiness as a household need" },
    hh_need_digital_access: { unit: "household", category: "education", threshold: 30, highThreshold: 60, title: "Household-reported digital-access needs", baseNoun: "sampled households", predicate: "named digital access as a household need" },
    res_school_age_not_enrolled: { unit: "resident", category: "education", threshold: 10, highThreshold: 25, title: "School-age residents not enrolled", baseNoun: "sampled school-age residents (6–17)", predicate: "are not currently enrolled" },
    res_labor_force_unemployed: { unit: "resident", category: "livelihood", threshold: 15, highThreshold: 30, title: "Unemployment among working-age residents", baseNoun: "sampled working-age residents in the labor force (18–59)", predicate: "are unemployed and looking for work" },
    res_disability_support: { unit: "resident", category: "health", threshold: 10, highThreshold: 20, title: "Residents needing disability support", baseNoun: "sampled residents", predicate: "have a recorded disability support need" },
    res_health_support: { unit: "resident", category: "health", threshold: 15, highThreshold: 30, title: "Residents needing health support", baseNoun: "sampled residents", predicate: "have a recorded health support need" },
  } satisfies Record<NeedIndicatorCode, IndicatorRule>,
} as const;
export type NeedSuggestionPolicy = typeof NEED_SUGGESTION_POLICY;

export function needSuggestionFingerprint(cycleId: string, code: NeedIndicatorCode): string {
  return createHash("sha256").update(`${cycleId}|${code}`, "utf8").digest("hex");
}

export function wilsonInterval(successes: number, total: number): { low: number; high: number } | null {
  if (!Number.isFinite(successes) || !Number.isFinite(total) || total <= 0 || successes < 0 || successes > total) return null;
  const z = 1.96; const p = successes / total; const denominator = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denominator;
  const spread = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denominator;
  return { low: Math.max(0, Math.round((centre - spread) * 100)), high: Math.min(100, Math.round((centre + spread) * 100)) };
}

function countValue(count: SuppressedCount): number | null { return count.suppressed ? null : count.value; }

export type NeedSuggestion = {
  fingerprint: string; code: NeedIndicatorCode; unit: "household" | "resident"; category: NeedCategory;
  priority: "high" | "medium"; base: number; count: number | null; lowerBound: number | null;
  percent: number; percentIsLowerBound: boolean; interval: { low: number; high: number } | null;
  confidence: "low" | "moderate" | "higher"; threshold: number; highThreshold: number;
  title: string; description: string; affectedCount: number | null;
  cycle: { id: string; name: string; reportingDate: string }; barangay: { id: string; name: string };
  evidenceSnapshotId: string; policyVersion: "cna.need-suggestions.v1";
};

export function evaluateNeedSuggestions({ document, barangayName }: { document: NeedIndicatorDocument; barangayName: string }): NeedSuggestion[] {
  const parsed = needIndicatorDocumentSchema.parse(document); const suggestions: NeedSuggestion[] = [];
  for (const indicator of parsed.indicators) {
    const rule = NEED_SUGGESTION_POLICY.rules[indicator.code];
    const base = countValue(indicator.base); const yes = countValue(indicator.yes);
    if (base === null || base < NEED_SUGGESTION_POLICY.minBase) continue;
    let count: number | null = yes; let lowerBound: number | null = null; let percentIsLowerBound = false; let percent: number | null = null; let interval: { low: number; high: number } | null = null;
    if (yes !== null) { percent = yes / base * 100; interval = wilsonInterval(yes, base); }
    else if (indicator.yes.suppressed && indicator.yes.label === "suppressed" && indicator.no.suppressed && indicator.no.label === `<${parsed.privacy.suppressionThreshold}`) {
      const k = parsed.privacy.suppressionThreshold; if (!Number.isInteger(k) || k < 2) continue;
      lowerBound = Math.max(0, base - (k - 1)); percent = lowerBound / base * 100; count = null; percentIsLowerBound = true;
    } else continue; // A directly suppressed numerator is never actionable.
    if (percent === null || percent < rule.threshold) continue;
    const roundedPercent = Math.round(percent * 10) / 10;
    const evidence = percentIsLowerBound
      ? `At least ${lowerBound} of ${base} ${rule.baseNoun} (≥${roundedPercent}%) ${rule.predicate}.`
      : `${yes} of ${base} ${rule.baseNoun} (${roundedPercent}%) ${rule.predicate}.`;
    const description = `${evidence} Source: ${parsed.cycle.name} profiling cycle (reporting date ${parsed.cycle.reportingDate}), approved packages only. This is a sample-based estimate, not a census. Suggested by AGAPE data rules (${NEED_SUGGESTION_POLICY.version}); review before approval.`;
    suggestions.push({
      fingerprint: needSuggestionFingerprint(parsed.cycle.id, indicator.code), code: indicator.code, unit: indicator.unit,
      category: rule.category, priority: percent >= rule.highThreshold ? "high" : "medium", base, count, lowerBound,
      percent: roundedPercent, percentIsLowerBound, interval,
      confidence: base < NEED_SUGGESTION_POLICY.moderateConfidenceBase ? "low" : base < NEED_SUGGESTION_POLICY.highConfidenceBase ? "moderate" : "higher",
      threshold: rule.threshold, highThreshold: rule.highThreshold, title: rule.title, description: description.slice(0, 2000),
      affectedCount: indicator.unit === "resident" ? (percentIsLowerBound ? lowerBound : yes) : null,
      cycle: { id: parsed.cycle.id, name: parsed.cycle.name, reportingDate: parsed.cycle.reportingDate },
      barangay: { id: parsed.cycle.barangayId, name: barangayName }, evidenceSnapshotId: parsed.evidenceSnapshotId,
      policyVersion: NEED_SUGGESTION_POLICY.version,
    });
  }
  return suggestions.sort((a, b) => a.priority === b.priority ? b.percent - a.percent || a.code.localeCompare(b.code) : a.priority === "high" ? -1 : 1);
}
