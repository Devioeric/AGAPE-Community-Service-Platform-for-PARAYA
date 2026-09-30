import { FOCUS_SDG_NUMBERS, isFocusSdg } from "../sdg-focus.js";
export { focusSdgs } from "../sdg-focus.js";

export function analyticsFilter(params: URLSearchParams) {
  const barangayId = params.get("barangay_id") || null;
  const yearText = params.get("year");
  const type = params.get("type") || null;
  if (barangayId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(barangayId)) throw new Error("Invalid barangay filter");
  if (yearText && (!/^\d{4}$/.test(yearText) || Number(yearText) < 1900 || Number(yearText) > 9998)) throw new Error("Invalid year filter");
  if (type && !["dashboard", "volunteers", "community-needs", "sdg", "proposals"].includes(type)) throw new Error("Invalid analytics type");
  const year = yearText ? Number(yearText) : null;
  return { barangayId, year, type, yearStart: year ? `${year}-01-01` : null, yearEnd: year ? `${year}-12-31` : null, nextYearStart: year ? `${year + 1}-01-01` : null };
}

export function countSdgAlignments(rows: Array<{ sdg_number: number }>): Record<number, number> {
  const counts = Object.fromEntries(FOCUS_SDG_NUMBERS.map(number => [number, 0]));
  for (const { sdg_number: number } of rows) if (isFocusSdg(number)) counts[number]++;
  return counts;
}

export function dayAfter(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) throw new Error("Invalid date");
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
