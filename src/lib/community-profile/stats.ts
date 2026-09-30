import type { ProfileIndicator } from "./catalog";
import type { IndicatorValue } from "./schema";

/** Sum of the reported counts; null when nothing was reported. */
export function indicatorTotal(value: IndicatorValue | undefined): number | null {
  if (!value) return null;
  let total = 0;
  let reported = false;
  for (const count of Object.values(value.counts)) {
    if (typeof count === "number") { total += count; reported = true; }
  }
  return reported ? total : null;
}

/** Percentage (0–100) of the table total held by the given categories; null when the table is empty. */
export function share(value: IndicatorValue | undefined, categoryKeys: readonly string[]): number | null {
  const total = indicatorTotal(value);
  if (!value || !total) return null;
  let part = 0;
  for (const key of categoryKeys) part += value.counts[key] ?? 0;
  return (part / total) * 100;
}

/** One row per catalog category, in catalog order. */
export function indicatorRows(indicator: ProfileIndicator, value: IndicatorValue | undefined) {
  const total = indicatorTotal(value);
  return indicator.categories.map((category) => {
    const count = value?.counts[category.key] ?? null;
    return { key: category.key, label: category.label, count, percent: count === null || !total ? null : (count / total) * 100 };
  });
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
