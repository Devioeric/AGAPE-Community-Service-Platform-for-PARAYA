import { z } from "zod";

export const profilingSummarySchema = z.object({
  asOf: z.string(),
  scope: z.object({ role: z.string(), barangayId: z.string().nullable(), cycleId: z.string().nullable() }).strict(),
  filters: z.object({
    barangays: z.array(z.object({ id: z.string(), name: z.string(), allowed: z.boolean() }).strict()),
    statuses: z.array(z.string()),
  }).strict(),
  kpis: z.object({
    totalHouseholds: z.number().int().nonnegative().nullable(),
    totalResidents: z.number().int().nonnegative().nullable(),
    approvedPackages: z.number().int().nonnegative().nullable(),
    awaitingReview: z.number().int().nonnegative().nullable(),
    returnedPackages: z.number().int().nonnegative().nullable(),
    highPriorityNeeds: z.number().int().nonnegative().nullable(),
  }).strict(),
  profiles: z.object({
    rows: z.array(z.object({
      packageId: z.string(), householdCode: z.string(), barangayId: z.string(), barangayName: z.string(), sitio: z.string().nullable(),
      priorityNeedCount: z.number().int().nonnegative().nullable(),
      residentCount: z.number().int().nonnegative().nullable(), status: z.string(), submittedAt: z.string().nullable(),
      reviewedAt: z.string().nullable(), returnReason: z.string().nullable(),
    }).strict()),
    page: z.number().int().positive(), pageSize: z.number().int().positive().max(25), total: z.number().int().nonnegative(),
  }).strict(),
  needs: z.object({
    rows: z.array(z.object({
      id: z.string(), barangayId: z.string(), category: z.string(), title: z.string(), priority: z.string(), status: z.string(),
      sitio: z.string().nullable(), submittedAt: z.string().nullable(), reviewedAt: z.string().nullable(),
    }).strict()),
    page: z.number().int().positive(), pageSize: z.number().int().positive().max(25), total: z.number().int().nonnegative(),
  }).strict(),
  availability: z.object({ profiling: z.enum(["available", "empty", "unavailable", "suppressed"]), needs: z.enum(["available", "empty", "unavailable", "suppressed"]) }).strict(),
  warnings: z.array(z.string()),
}).strict();

export type ProfilingSummaryResponse = z.infer<typeof profilingSummarySchema>;

export function parseProfilingSummaryResponse(value: unknown): ProfilingSummaryResponse {
  return profilingSummarySchema.parse(value);
}
