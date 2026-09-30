import { z } from "zod";
import { parseAnalyticsView } from "@/lib/analytics/view-contract";

const programs = z.array(z.object({
  id: z.string().min(1), title: z.string(), status: z.string(),
  start_date: z.string().nullable(), end_date: z.string().nullable(),
  barangays: z.object({ name: z.string() }).nullable(),
}));
export const parseRecentPrograms = (data: unknown) => programs.parse(data).slice(0, 6);
export const parseDashboardAnalytics = (data: unknown) => parseAnalyticsView("dashboard", data);
// Validate only the aggregate presentation boundary. The full recommendation
// engine also hashes evidence with Node crypto and must never enter this bundle.
const recommendationCounts = z.object({
  schema: z.literal("agape.ai.need-recommendations.v2"), advisoryOnly: z.literal(true),
  recommendations: z.array(z.object({
    needId: z.string().uuid(),
    barangay: z.object({ name: z.string().trim().min(1).max(160) }),
    intervention: z.object({ title: z.string().trim().min(1).max(160) }),
    priority: z.object({ label: z.enum(["critical", "high", "medium", "low"]) }),
  })).max(100),
  summary: z.object({
    recommendationCount: z.number().int().nonnegative(),
    unaddressedNeeds: z.number().int().nonnegative(),
    needsWithPlannedResponses: z.number().int().nonnegative(),
  }),
});
export const parseDashboardRecommendations = (data: unknown) => recommendationCounts.parse(data);
export type DashboardRecommendations = z.infer<typeof recommendationCounts>;
