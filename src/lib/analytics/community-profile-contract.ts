import { z } from "zod";

const amount = z.number().finite().nonnegative();

const table = z.object({
  id: z.string(), topic: z.string(), section: z.string(), base: amount.nullable(), multipleResponses: z.boolean(),
  rows: z.array(z.object({ category: z.string(), count: amount, percent: amount })),
});

const profile = z.object({
  datasetId: z.string(), cycleId: z.string(), barangayId: z.string(), barangay: z.string(),
  sourceTitle: z.string(), sourceLocation: z.string(), sourceFiles: z.array(z.string()),
  importedAt: z.string().nullable(), households: amount.nullable(), residents: amount.nullable(),
  indicators: z.array(z.object({ key: z.string(), label: z.string(), theme: z.string(), percent: amount, count: amount, base: amount, ofResponses: z.boolean() })),
  tables: z.array(table),
});

export const communityProfileSchema = z.object({
  status: z.enum(["available", "empty", "disabled"]),
  profiles: z.array(profile),
});

export type CommunityProfileData = z.infer<typeof communityProfileSchema>;
export type CommunityProfile = CommunityProfileData["profiles"][number];
export type CommunityProfileTable = z.infer<typeof table>;

/** Parse raw response.data; an invalid successful envelope is an error, never "no data". */
export function parseCommunityProfile(payload: unknown): CommunityProfileData {
  const result = communityProfileSchema.safeParse(payload);
  if (!result.success) throw new Error("Invalid community profile response");
  return result.data;
}
