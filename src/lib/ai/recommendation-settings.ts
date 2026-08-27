import { z } from "zod";

export const recommendationSettingsUpdateSchema = z.object({
  sufficientCoveragePercent: z.number().int().min(1).max(100),
  expectedVersion: z.number().int().positive(),
}).strict();

export const recommendationSettingsDtoSchema = z.object({
  sufficientCoveragePercent: z.number().int().min(1).max(100),
  rowVersion: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();

export type RecommendationSettingsDTO = z.infer<typeof recommendationSettingsDtoSchema>;
