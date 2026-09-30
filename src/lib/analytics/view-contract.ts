import { z } from "zod";
import { isFocusSdg, focusSdgs } from "../sdg-focus.js";

const amount = z.number().finite().nonnegative();
const counts = z.record(z.string(), amount);
const programs = z.object({ total: amount, byStatus: counts, chartData: z.array(z.object({ status: z.string(), count: amount })) });
const volunteers = z.object({ total: amount, active: amount, scope: z.literal("all_accounts") });
const hours = z.object({ total: amount, byMonth: z.array(z.object({ month: z.string(), hours: amount })) });
// Validate first, then omit out-of-focus data from older compatible responses.
const sdg = z.object({ counts: z.array(z.object({ sdg: z.number().int().min(1).max(17), count: amount })).transform(rows => rows.filter(row => isFocusSdg(row.sdg))) });
const proposals = z.object({ total: amount, byStatus: counts });
const topBarangays = z.array(z.object({ name: z.string(), count: amount }));
const needs = z.object({ byCategory: z.array(z.object({ category: z.string(), count: amount })) });
const programStats = z.array(z.object({ id: z.string(), title: z.string(), status: z.string(), barangay: z.string(), volunteerCount: amount, totalHours: amount }));
const topVolunteers = z.array(z.object({ label: z.string(), hours: amount }));
const recentNeeds = z.array(z.object({ id: z.string(), barangay: z.string(), category: z.string(), title: z.string(), description: z.string(), priority: z.string(), created_at: z.string().datetime({ offset: true }) }));
const proposalRows = z.array(z.object({ id: z.string(), title: z.string(), status: z.string(), barangay: z.string(), sdgs: z.array(z.number().int().min(1).max(17)).transform(focusSdgs), date: z.string().datetime({ offset: true }) }));
const donations = z.object({ total: amount, totalQty: amount, totalDistributed: amount, byType: z.array(z.object({ type: z.string(), qty: amount })) });

// Chart-ready aggregates from src/lib/analytics/insights.ts. Optional so older
// responses without them still parse; a present but malformed block is rejected.
const priorities = { critical: amount, high: amount, medium: amount, low: amount };
const stages = { approved: amount, in_review: amount, revisions: amount, draft: amount, rejected: amount };
const sdgColumns = z.record(z.string(), z.union([z.string(), amount]));
const needsInsights = z.object({
  totals: z.object({ approved: amount, submitted: amount, awaitingReview: amount, needsRevision: amount, rejected: amount, criticalOrHigh: amount, addressed: amount, addressedRate: amount, peopleAffected: amount, barangaysReporting: amount }),
  byPriority: z.array(z.object({ priority: z.string(), count: amount })),
  byStatus: z.array(z.object({ status: z.string(), count: amount })),
  review: z.array(z.object({ stage: z.string(), count: amount })),
  byCategory: z.array(z.object({ category: z.string(), identified: amount, in_progress: amount, addressed: amount, total: amount, people: amount, ...priorities })),
  byBarangay: z.array(z.object({ barangay: z.string(), needs: amount, addressed: amount, programs: amount, ...priorities })),
  monthly: z.array(z.object({ month: z.string(), total: amount, ...priorities })),
  bySource: z.array(z.object({ source: z.string(), count: amount })),
});
const volunteerInsights = z.object({
  byCourse: z.array(z.object({ course: z.string(), count: amount })),
  byYearLevel: z.array(z.object({ level: z.string(), count: amount })),
  accountStatus: z.array(z.object({ status: z.string(), count: amount })),
  logReview: z.array(z.object({ status: z.string(), entries: amount, hours: amount })),
  hoursByBarangay: z.array(z.object({ barangay: z.string(), hours: amount, volunteers: amount })),
  activeByMonth: z.array(z.object({ month: z.string(), hours: amount, volunteers: amount })),
  signupStatus: z.array(z.object({ status: z.string(), count: amount })),
  checkInsByMonth: z.array(z.object({ month: z.string(), qr: amount, otp: amount, manual: amount, total: amount })),
  totalCheckIns: amount,
});
const sdgInsights = z.object({
  byStage: z.array(z.object({ sdg: z.number().int(), ...stages })),
  investment: z.array(z.object({ sdg: z.number().int(), requested: amount, approved: amount, beneficiaries: amount })),
  byBarangay: z.array(sdgColumns.and(z.object({ barangay: z.string(), total: amount }))),
  delivery: z.array(z.object({ sdg: z.number().int(), programs: amount, outcomes: amount })),
  quarterly: z.array(sdgColumns.and(z.object({ quarter: z.string() }))),
});
const proposalInsights = z.object({
  totals: z.object({ requestedBudget: amount, approvedBudget: amount, averageBudget: amount, expectedBeneficiaries: amount, approvedBeneficiaries: amount, communityValidated: amount }),
  monthly: z.array(z.object({ month: z.string(), total: amount, ...stages })),
  byBarangay: z.array(z.object({ barangay: z.string(), total: amount, ...stages })),
  budgetByStage: z.array(z.object({ stage: z.string(), budget: amount, count: amount })),
  revisions: z.array(z.object({ rounds: z.string(), count: amount })),
  prescreening: z.array(z.object({ result: z.string(), count: amount })),
  finance: z.array(z.object({ group: z.string(), count: amount })),
});

export const analyticsViewSchemas = {
  overview: z.object({ programs, volunteers, hours, donations, sdg, needs, proposals, topBarangays, programStats, topVolunteers, recentNeeds, surveysCompletedCount: amount, proposalRows }),
  dashboard: z.object({ hours, sdg, topBarangays }),
  volunteers: z.object({ programs, volunteers, hours, topBarangays, programStats, topVolunteers, volunteerInsights: volunteerInsights.optional() }),
  sdg: z.object({ programs, proposals, sdg, proposalRows, sdgInsights: sdgInsights.optional() }),
  proposals: z.object({ proposals, sdg, proposalRows, proposalInsights: proposalInsights.optional() }),
  "community-needs": z.object({ needs, recentNeeds, surveysCompletedCount: amount, topBarangays, needsInsights: needsInsights.optional() }),
};
export type AnalyticsView = keyof typeof analyticsViewSchemas;
export type AnalyticsViewData<T extends AnalyticsView> = z.infer<(typeof analyticsViewSchemas)[T]>;

/** Parse raw response.data; do not treat an invalid successful envelope as empty. */
export function parseAnalyticsView<T extends AnalyticsView>(type: T, payload: unknown): AnalyticsViewData<T> {
  const result = analyticsViewSchemas[type].safeParse(payload);
  if (!result.success) throw new Error("Invalid analytics response");
  return result.data as AnalyticsViewData<T>;
}
