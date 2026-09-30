import { z } from "zod";

const amount = z.number().finite().nonnegative();

export const impactInsightsSchema = z.object({
  totals: z.object({
    peopleReached: amount, barangaysReached: amount, programsMeasured: amount, completedPrograms: amount, stories: amount,
    followUps: z.object({ total: amount, completed: amount, upcoming: amount, overdue: amount }),
  }),
  reachByBarangay: z.array(z.object({ barangay: z.string(), people: amount, programs: amount })),
  plannedVsActual: z.array(z.object({ program: z.string(), barangay: z.string(), planned: amount, reached: amount })),
  followThrough: z.array(z.object({ month: z.string(), completed: amount, upcoming: amount, overdue: amount })),
  surveyPairs: z.array(z.object({ baselineId: z.string(), baselineTitle: z.string(), followupId: z.string(), followupTitle: z.string() })),
});

export type ImpactInsights = z.infer<typeof impactInsightsSchema>;

/** Parse raw response.data; an invalid successful envelope is an error, never "no data". */
export function parseImpactInsights(payload: unknown): ImpactInsights {
  const result = impactInsightsSchema.safeParse(payload);
  if (!result.success) throw new Error("Invalid impact insights response");
  return result.data;
}

// Shape returned by GET /api/surveys/compare, limited to what the before/after chart uses.
export const surveyComparisonSchema = z.object({
  baseline: z.object({ id: z.string(), title: z.string() }).passthrough(),
  followup: z.object({ id: z.string(), title: z.string() }).passthrough(),
  response_counts: z.object({ baseline: amount, followup: amount }),
  matched: z.array(z.object({
    question_text: z.string(),
    question_type: z.string(),
    baseline: z.object({ distribution: z.array(z.object({ label: z.string(), count: amount, pct: amount })), response_count: amount, average: z.number().nullable() }),
    followup: z.object({ distribution: z.array(z.object({ label: z.string(), count: amount, pct: amount })), response_count: amount, average: z.number().nullable() }),
    avg_delta: z.number().nullable(),
  }).passthrough()),
}).passthrough();

export type SurveyComparison = z.infer<typeof surveyComparisonSchema>;
