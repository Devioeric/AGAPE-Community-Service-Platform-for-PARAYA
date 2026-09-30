import { z } from "zod";
import type { DashboardSummaryDTO } from "./contracts";

export const dashboardTrendSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("available"), previousValue: z.number().finite().nonnegative(), previousAsOf: z.string().datetime({ offset: true }) }).strict(),
  z.object({ state: z.enum(["no_history", "unavailable"]) }).strict(),
]);
export type DashboardTrend = z.infer<typeof dashboardTrendSchema>;

const count = z.number().int().finite().nonnegative();
export const dashboardBaselineSchema = z.object({
  schema: z.literal("agape.dashboard.baseline.v1"),
  definition: z.literal("agape.dashboard.summary.v2"),
  scope: z.literal("global"),
  capturedAt: z.string().datetime({ offset: true }),
  values: z.object({ programs: count.optional(), proposal_queue: count.optional(), active_partnerships: count.optional() }).strict(),
}).strict();
export type DashboardBaseline = z.infer<typeof dashboardBaselineSchema>;
const comparableKeys = ["programs", "proposal_queue", "active_partnerships"] as const;

export function supportsDashboardTrends(summary: DashboardSummaryDTO) {
  return summary.schema === "agape.dashboard.summary.v2" && summary.role === "paraya_officer";
}

/** Existing analytics snapshots use UTC calendar months. Never reinterpret period totals as stocks. */
export function previousDashboardMonth(asOf: string) {
  const date = new Date(asOf);
  return { start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)).toISOString(), end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString() };
}

/** Copy only authorized canonical aggregate values; no actor or resident data is retained. */
export function captureDashboardBaseline(summary: DashboardSummaryDTO, periodStart: string): DashboardBaseline | null {
  if (!supportsDashboardTrends(summary) || new Date(summary.asOf).toISOString().slice(0, 7) !== periodStart.slice(0, 7)) return null;
  const values: DashboardBaseline["values"] = {};
  for (const key of comparableKeys) {
    const card = summary.cards.find(card => card.key === key);
    if (card) values[key] = card.value;
  }
  const result = dashboardBaselineSchema.safeParse({ schema: "agape.dashboard.baseline.v1", definition: "agape.dashboard.summary.v2", scope: "global", capturedAt: new Date(summary.asOf).toISOString(), values });
  return result.success && Object.keys(values).length > 0 ? result.data : null;
}

export function attachDashboardTrends(summary: DashboardSummaryDTO, rows: readonly { data?: unknown }[], unavailable = false): DashboardSummaryDTO {
  if (!supportsDashboardTrends(summary)) return summary;
  const window = previousDashboardMonth(summary.asOf);
  const baselines = rows.flatMap(row => {
    const data = row.data && typeof row.data === "object" ? row.data as { dashboardKpis?: unknown } : {};
    const parsed = dashboardBaselineSchema.safeParse(data.dashboardKpis);
    if (!parsed.success) return [];
    const time = Date.parse(parsed.data.capturedAt);
    return time >= Date.parse(window.start) && time < Date.parse(window.end) ? [parsed.data] : [];
  }).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  return { ...summary, cards: summary.cards.map(card => {
    const key = comparableKeys.find(key => key === card.key);
    const baseline = key ? baselines.find(baseline => baseline.values[key] !== undefined) : undefined;
    const trend: DashboardTrend = unavailable ? { state: "unavailable" }
      : baseline && key ? { state: "available", previousValue: baseline.values[key]!, previousAsOf: baseline.capturedAt }
      : { state: "no_history" };
    return { ...card, trend };
  }) };
}

export function dashboardTrendPresentation(key: string, value: number, trend: DashboardTrend) {
  if (trend.state !== "available") return { direction: "flat" as const, tone: "neutral" as const, label: trend.state === "unavailable" ? "Trend unavailable" : "No comparison data yet", detail: "A matching previous-month snapshot is required." };
  const delta = value - trend.previousValue;
  const direction = delta > 0 ? "up" as const : delta < 0 ? "down" as const : "flat" as const;
  const percentage = trend.previousValue === 0 ? null : (delta / trend.previousValue) * 100;
  const number = percentage === null || !Number.isFinite(percentage) ? null : Math.abs(percentage).toLocaleString("en-US", { maximumFractionDigits: 1 });
  const change = delta === 0 ? "No change" : percentage === null ? "New" : number === null ? "Increased" : `${delta > 0 ? "+" : "−"}${number === "0" ? "<0.1" : number}%`;
  // Queue growth is not an improvement. Color is accompanied by text and direction.
  const favorable = key === "proposal_queue" ? delta < 0 : delta > 0;
  const date = new Date(trend.previousAsOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return { direction, tone: delta === 0 ? "neutral" as const : favorable ? "positive" as const : "attention" as const,
    label: `${change} vs last month`, detail: `Compared with ${trend.previousValue.toLocaleString("en-US")} recorded ${date} (UTC). Change: ${delta > 0 ? "+" : ""}${delta.toLocaleString("en-US")}. This is a recorded total, not a completion target.` };
}
