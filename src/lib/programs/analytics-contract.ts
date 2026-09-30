import { z } from "zod";

const number = z.number().finite();
const nullableText = z.string().nullable();
export const programAnalyticsBudgetLineSchema = z.object({
  id: z.string(), category: z.string(), allocated: number, spent: number, notes: nullableText,
});
export type ProgramAnalyticsBudgetLine = z.infer<typeof programAnalyticsBudgetLineSchema>;
export const programAnalyticsSchema = z.object({
  program: z.object({
    id: z.string(), title: z.string(), description: nullableText, status: z.string(),
    start_date: nullableText, end_date: nullableText, budget: number.nullable(),
    target_beneficiaries: number.nullable(), barangay_name: nullableText,
  }),
  kpis: z.object({
    activities_total: number, activities_completed: number, attendance_total: number,
    signups_active: number, hours_approved: number, hours_pending: number,
    budget_planned: number, budget_actual: number, budget_utilization: number,
  }),
  activities: z.array(z.object({ id: z.string(), title: z.string(), date: z.string(), status: z.string(), is_past: z.boolean(), attendance: number })),
  activities_by_status: z.record(z.string(), number), signups_by_status: z.record(z.string(), number),
  hours_timeline: z.array(z.object({ month: z.string(), hours: number })),
  followups: z.object({
    stages: z.array(z.object({ stage: z.enum(["immediate", "6_month", "12_month"]), total: number, completed: number })),
    records: z.array(z.object({ id: z.string(), followup_type: z.string(), status: z.string(), scheduled_date: z.string(), completed_date: nullableText, notes: nullableText })),
  }),
  budget_lines: z.array(programAnalyticsBudgetLineSchema),
  impact: z.object({
    indicators: z.array(z.object({ id: z.string(), indicator_type: z.string(), value: number.nullable(), unit: z.string(), recorded_date: z.string(), notes: nullableText })),
    indicator_totals: z.record(z.string(), z.object({ value: number, unit: z.string() })),
    qualitative: z.array(z.object({ id: z.string(), type: z.string(), content: z.string(), subject_name: nullableText, recorded_date: z.string() })),
    qualitative_by_type: z.record(z.string(), number),
  }),
}).superRefine((data, ctx) => {
  const planned = data.budget_lines.reduce((sum, row) => sum + row.allocated, 0);
  const actual = data.budget_lines.reduce((sum, row) => sum + row.spent, 0);
  if (planned !== data.kpis.budget_planned || actual !== data.kpis.budget_actual ||
      data.kpis.budget_utilization !== (planned > 0 ? Math.round(actual / planned * 100) : 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Budget summary does not reconcile" });
  }
});
export type ProgramAnalytics = z.infer<typeof programAnalyticsSchema>;
export function parseProgramAnalytics(value: unknown): ProgramAnalytics {
  return programAnalyticsSchema.parse(value);
}

/** Shared numeric workbook mapping: never coerce unavailable financial values to zero. */
export function programBudgetWorkbookRows(lines: ProgramAnalyticsBudgetLine[]) {
  return z.array(programAnalyticsBudgetLineSchema).parse(lines).map(row => ({
    Category: row.category, Planned: row.allocated, Actual: row.spent,
    Variance: row.allocated - row.spent, Notes: row.notes ?? "",
  }));
}
