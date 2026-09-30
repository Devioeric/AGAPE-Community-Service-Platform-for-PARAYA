import { z } from "zod";

export const reportingAggregateSchema = z.object({
  schema: z.literal("agape.reporting.aggregate.v1"),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  asOf: z.string().date(),
  source: z.literal("approved_operational_records"),
  programs: z.object({ total: z.number().int().nonnegative(), active: z.number().int().nonnegative(), completed: z.number().int().nonnegative() }).strict(),
  volunteers: z.object({ approvedServiceHours: z.number().nonnegative() }).strict(),
  donations: z.object({ activeRecords: z.number().int().nonnegative(), totalQuantity: z.number().nonnegative() }).strict(),
  needs: z.object({ documented: z.number().int().nonnegative() }).strict(),
  proposals: z.object({ created: z.number().int().nonnegative() }).strict(),
  quality: z.object({
    approvedActivityHoursOnly: z.literal(true),
    archivedDonationsExcluded: z.literal(true),
    voidedImpactExcluded: z.literal(true),
    residentDataIncluded: z.literal(false),
  }).strict(),
}).strict();

export type ReportingAggregateDTO = z.infer<typeof reportingAggregateSchema>;

/** Versioned reporting aggregate used by structured period reports. The v1
 * aggregate remains accepted for legacy callers and old report rows. */
export const reportingAggregateV2Schema = z.object({
  schema: z.literal("agape.reporting.aggregate.v2"),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  asOf: z.string().date(),
  source: z.literal("approved_and_status_explicit_operational_records"),
  programs: z.object({ total: z.number().int().nonnegative(), active: z.number().int().nonnegative(), completed: z.number().int().nonnegative(), statusBreakdown: z.record(z.string(), z.number().int().nonnegative()).default({}) }).strict(),
  volunteers: z.object({ approvedServiceHours: z.number().nonnegative(), participants: z.number().int().nonnegative().nullable().default(null) }).strict(),
  donations: z.object({ activeRecords: z.number().int().nonnegative(), totalQuantity: z.number().nonnegative().nullable(), byType: z.record(z.string(), z.number().int().nonnegative()).default({}) }).strict(),
  needs: z.object({ approved: z.number().int().nonnegative(), documented: z.number().int().nonnegative(), statusBreakdown: z.record(z.string(), z.number().int().nonnegative()).default({}) }).strict(),
  proposals: z.object({ created: z.number().int().nonnegative(), statusBreakdown: z.record(z.string(), z.number().int().nonnegative()).default({}) }).strict(),
  profiling: z.object({ cycleCount: z.number().int().nonnegative().nullable(), sampleSize: z.number().int().nonnegative().nullable(), coveredAreas: z.number().int().nonnegative().nullable() }).strict(),
  partnerships: z.object({ active: z.number().int().nonnegative().nullable(), unexpired: z.number().int().nonnegative().nullable() }).strict(),
  historicalPrograms: z.object({ verified: z.number().int().nonnegative().nullable(), partial: z.number().int().nonnegative().nullable(), unverified: z.number().int().nonnegative().nullable() }).strict(),
  finance: z.object({ allocated: z.number().finite().nullable(), spent: z.number().finite().nullable(), variance: z.number().finite().nullable() }).strict(),
  sdg: z.object({ "4": z.number().int().nonnegative(), "9": z.number().int().nonnegative(), "11": z.number().int().nonnegative(), "17": z.number().int().nonnegative() }).strict(),
  impact: z.object({ indicators: z.number().int().nonnegative().nullable(), qualitativeRecords: z.number().int().nonnegative().nullable(), followUpOpen: z.number().int().nonnegative().nullable() }).strict(),
  quality: z.object({ flags: z.array(z.string().max(500)).max(50), domainStatuses: z.record(z.string(), z.enum(["available", "empty", "unavailable", "suppressed"])) }).strict(),
}).strict();

export type ReportingAggregateV2DTO = z.infer<typeof reportingAggregateV2Schema>;

export const deliveryRuntimeUpdateSchema = z.object({
  channel: z.enum(["email", "sms"]),
  mode: z.enum(["off", "synthetic", "live"]),
  providerKey: z.string().trim().min(1).max(100),
  syntheticUserIds: z.array(z.string().uuid()).max(100).default([]),
}).strict();

export const deliveryRuntimeSchema = z.object({
  channel: z.enum(["email", "sms"]),
  mode: z.enum(["off", "synthetic", "live"]),
  providerKey: z.string(),
  rowVersion: z.number().int().positive(),
  syntheticUserCount: z.number().int().nonnegative(),
  queuedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  suppressedCount: z.number().int().nonnegative(),
}).strict();

export type DeliveryRuntimeDTO = z.infer<typeof deliveryRuntimeSchema>;

export type NotificationDeliveryClaim = {
  id: string;
  channel: "email" | "sms";
  claimToken: string;
  destination: string;
  title: string;
  message: string;
  actionUrl: string | null;
  providerKey: string;
};

export type NotificationProviderResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; errorCode: string };
