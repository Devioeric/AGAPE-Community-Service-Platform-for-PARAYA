import { z } from "zod";

export const recommendationAutomationModeSchema = z.enum(["off", "synthetic", "live"]);
export type RecommendationAutomationMode = z.infer<typeof recommendationAutomationModeSchema>;

export const recommendationNotificationSyncResultSchema = z.object({
  created: z.number().int().nonnegative(),
  eligibleRecommendations: z.number().int().nonnegative(),
  skippedDismissed: z.number().int().nonnegative(),
}).strict();

export function getRecommendationAutomationMode(): RecommendationAutomationMode {
  const parsed = recommendationAutomationModeSchema.safeParse(
    process.env.AGAPE_AI_RECOMMENDATION_AUTOMATION_MODE ?? "off",
  );
  return parsed.success ? parsed.data : "off";
}

export function isRecommendationAutomationEnabled(): boolean {
  return process.env.AGAPE_AI_RECOMMENDATION_AUTOMATION_ENABLED === "true"
    && getRecommendationAutomationMode() !== "off";
}
