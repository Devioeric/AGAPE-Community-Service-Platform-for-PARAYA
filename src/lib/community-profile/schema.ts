import { z } from "zod";
import { PROFILE_INDICATORS, type ProfileIndicator } from "./catalog";

// A count is a whole number; null means "not reported", which is not the same as 0.
const count = z.number().int().min(0).max(1_000_000).nullable();

function indicatorSchema(indicator: ProfileIndicator) {
  const counts: Record<string, z.ZodType<number | null | undefined>> = {};
  for (const category of indicator.categories) counts[category.key] = count.optional();
  return z.object({ counts: z.object(counts).strict(), note: z.string().trim().max(500).optional() }).strict();
}

const dataShape: Record<string, z.ZodType<IndicatorValue | undefined>> = {};
for (const indicator of PROFILE_INDICATORS) dataShape[indicator.key] = indicatorSchema(indicator).optional();

export type IndicatorValue = { counts: Record<string, number | null | undefined>; note?: string };
export type CommunityProfileData = Record<string, IndicatorValue | undefined>;

/** Unknown indicators or categories are rejected, so stored keys always match the catalog. */
export const communityProfileDataSchema: z.ZodType<CommunityProfileData> = z.object(dataShape).strict();

const text = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);

export const communityProfileInputSchema = z.object({
  coverage: text(240),
  source_title: z.string().trim().min(2).max(240),
  collected_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  respondent_households: count,
  individuals: count,
  notes: text(4000),
  data: communityProfileDataSchema,
  // null when creating the first profile for a barangay.
  expected_updated_at: z.string().datetime({ offset: true }).nullable(),
}).strict();

export type CommunityProfileInput = z.infer<typeof communityProfileInputSchema>;
