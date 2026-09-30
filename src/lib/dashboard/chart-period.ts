import { z } from "zod";

export const chartRangeSchema = z.enum(["month", "year", "all"]);
export type ChartRange = z.infer<typeof chartRangeSchema>;

/** Calendar periods use Philippine time, independent of the browser/server timezone. */
export function chartPeriod(range: ChartRange, now = new Date()) {
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  if (range === "all") return { range, dateStart: null, dateEnd: null, timestampStart: null, timestampEnd: null };
  const start = new Date(Date.UTC(year, range === "month" ? month : 0, 1));
  const end = new Date(Date.UTC(range === "month" ? year : year + 1, range === "month" ? month + 1 : 0, 1));
  const timestamp = (value: Date) => new Date(value.getTime() - 8 * 60 * 60 * 1000).toISOString();
  return { range, dateStart: start.toISOString().slice(0, 10), dateEnd: end.toISOString().slice(0, 10), timestampStart: timestamp(start), timestampEnd: timestamp(end) };
}

const logSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hours: z.number().finite().nonnegative() });

/** Approved rows only, supplied by the scoped query. All-time groups by year, year by month, month by day. */
export function chartHourPoints(raw: unknown, period: ReturnType<typeof chartPeriod>) {
  const rows = z.array(logSchema).parse(raw);
  const counts = new Map<string, number>();
  if (period.range === "year") {
    for (let month = 1; month <= 12; month++) counts.set(`${period.dateStart!.slice(0, 4)}-${String(month).padStart(2, "0")}`, 0);
  } else if (period.range === "month") {
    const end = new Date(`${period.dateEnd}T00:00:00Z`);
    const days = new Date(end.getTime() - 86400000).getUTCDate();
    for (let day = 1; day <= days; day++) counts.set(`${period.dateStart!.slice(0, 7)}-${String(day).padStart(2, "0")}`, 0);
  }
  for (const row of rows) {
    const date = new Date(`${row.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.date) throw new Error("Invalid activity date");
    if (period.dateStart && (row.date < period.dateStart || row.date >= period.dateEnd!)) continue;
    const key = row.date.slice(0, period.range === "all" ? 4 : period.range === "year" ? 7 : 10);
    counts.set(key, (counts.get(key) ?? 0) + row.hours);
  }
  return Array.from(counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ label: key, value: Math.round(value * 10) / 10 }));
}
