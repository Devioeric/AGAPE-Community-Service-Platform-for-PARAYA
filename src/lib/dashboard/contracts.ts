import { z } from "zod";

export const dashboardSummarySchema = z.object({
  schema: z.literal("agape.dashboard.summary.v1"),
  role: z.string().min(1),
  asOf: z.string().datetime({ offset: true }),
  cards: z.array(z.object({
    key: z.string().min(1), label: z.string().min(1), value: z.number().nonnegative(), href: z.string().startsWith("/"),
    tone: z.enum(["neutral", "info", "warning", "success"]),
  }).strict()).max(8),
}).strict();

export type DashboardSummaryDTO = z.infer<typeof dashboardSummarySchema>;

const modeSchema = z.enum(["off", "synthetic", "live", "missing"]);
export const systemReadinessSchema = z.object({
  schema: z.literal("agape.system.readiness.v1"), asOf: z.string().datetime({ offset: true }),
  databaseModes: z.object({
    profiling: modeSchema,
    phase2: z.record(z.string(), modeSchema),
    phase4: z.record(z.string(), modeSchema),
    financeIntegrity: modeSchema,
    communication: z.record(z.string(), modeSchema),
  }).strict(),
  mutationAuthority: z.record(z.string(), z.enum(["v1", "v2"])),
  accountHealth: z.object({ active: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), suspended: z.number().int().nonnegative(), unmappedLegacy: z.number().int().nonnegative() }).strict(),
  queues: z.object({ notificationDelivery: z.number().int().nonnegative(), financeIntegrity: z.number().int().nonnegative(), partnerEmail: z.number().int().nonnegative() }).strict(),
}).strict();

export type SystemReadinessDTO = z.infer<typeof systemReadinessSchema> & {
  applicationFlags: Record<string, boolean>;
};
