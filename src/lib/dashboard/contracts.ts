import { z } from "zod";
import { ACTIVE_LOGIN_ROLES } from "@/lib/auth/roles";
import { dashboardTrendSchema, previousDashboardMonth } from "./kpi-trend";

type DashboardHref = `/${string}`;

const dashboardHrefSchema = z.string()
  .regex(/^\/(?!\/)[^\s]*$/, "Dashboard links must be application-relative")
  .refine((href) => !href.includes("\\"), "Dashboard links cannot contain backslashes")
  .transform((href) => href as DashboardHref);

const dashboardCardSchema = z.object({
  key: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "Dashboard card keys must be stable identifiers"),
  label: z.string().trim().min(1).max(120),
  value: z.number().finite().nonnegative(),
  href: dashboardHrefSchema,
  tone: z.enum(["neutral", "info", "warning", "success"]),
  trend: dashboardTrendSchema.optional(),
}).strict();

const dashboardSummaryWireSchema = z.object({
  schema: z.enum(["agape.dashboard.summary.v1", "agape.dashboard.summary.v2"]),
  role: z.enum(ACTIVE_LOGIN_ROLES),
  asOf: z.string().datetime({ offset: true }),
  cards: z.array(dashboardCardSchema).max(8),
}).strict().superRefine((summary, context) => {
  const seen = new Set<string>();
  summary.cards.forEach((card, index) => {
    if (seen.has(card.key)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate dashboard card key: ${card.key}`,
        path: ["cards", index, "key"],
      });
    }
    seen.add(card.key);
    if (card.trend?.state === "available" && Number.isFinite(Date.parse(summary.asOf))) {
      const month = previousDashboardMonth(summary.asOf);
      const time = Date.parse(card.trend.previousAsOf);
      if (time < Date.parse(month.start) || time >= Date.parse(month.end)) {
        context.addIssue({ code: "custom", message: "Trend baseline must be from the previous calendar month", path: ["cards", index, "trend"] });
      }
    }
  });
});

type DashboardSummaryWire = z.infer<typeof dashboardSummaryWireSchema>;

function normalizeDashboardCardHref(summary: DashboardSummaryWire, key: string, href: DashboardHref): DashboardHref {
  // approved_hours is incorrect in both the original v1 function and the
  // first v2 role-consolidation function. Keep the application safe while the
  // forward-only SQL correction rolls out.
  if (summary.role === "volunteer" && key === "approved_hours") return "/volunteer/hours";

  if (summary.schema !== "agape.dashboard.summary.v1") return href;
  if (summary.role === "finance_officer" && key === "integrity_queue") return "/officer/finance";
  if (summary.role === "barangay_secretary" && key === "needs") return "/barangay/submit-needs";
  if (summary.role === "barangay_secretary" && key === "programs") return "/barangay/reports";
  return href;
}

export const dashboardSummarySchema = dashboardSummaryWireSchema.transform((summary) => ({
  ...summary,
  cards: summary.cards.map((card) => ({
    ...card,
    href: normalizeDashboardCardHref(summary, card.key, card.href),
  })),
}));

export type DashboardSummaryDTO = z.infer<typeof dashboardSummarySchema>;
export type DashboardSummaryCard = DashboardSummaryDTO["cards"][number];

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
