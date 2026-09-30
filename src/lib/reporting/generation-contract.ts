import { z } from "zod";

export const reportingPeriodSchema = z.object({ period_start: z.string().date(), period_end: z.string().date() }).strict()
  .refine(value => value.period_end >= value.period_start && (Date.parse(value.period_end) - Date.parse(value.period_start)) / 86_400_000 <= 730,
    { message: "Choose an ordered reporting period of no more than 730 days." });

export const REPORT_ERRORS = {
  invalid_period: "Choose valid dates in order, no more than 730 days apart.",
  aggregate_unavailable: "Reporting data is unavailable. No report was saved. Retry when the local data service is ready.",
  aggregate_invalid: "Reporting data does not match the required contract. No report was saved. Ask an administrator to verify migration compatibility.",
  provider_not_configured: "No report-writing provider is configured. Ask an administrator to configure one, or use the enabled synthetic local template fallback.",
  provider_unavailable: "The report-writing provider is unavailable. No report was saved. Please try again later.",
  provider_invalid_output: "The provider returned content that could not be validated. No report was saved. Please retry.",
  report_persistence_unavailable: "The draft could not be confirmed as saved. Retry this same request to safely recover it without creating a duplicate.",
} as const;
export type ReportingErrorCode = keyof typeof REPORT_ERRORS;
export class ReportingError extends Error {
  constructor(public readonly code: ReportingErrorCode) { super(REPORT_ERRORS[code]); }
}
