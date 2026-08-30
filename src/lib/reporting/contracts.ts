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
