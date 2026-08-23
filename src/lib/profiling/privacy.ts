import { z } from "zod";
import type { ProfilingAggregateDTO, SuppressedCount } from "@/types/profiling";

export const MINIMUM_SUPPRESSION_THRESHOLD = 5;

const suppressedCountSchema = z.discriminatedUnion("suppressed", [
  z.object({ suppressed: z.literal(false), value: z.number().int().nonnegative(), label: z.string().regex(/^\d+$/) }).strict(),
  z.object({ suppressed: z.literal(true), value: z.null(), label: z.string().regex(/^(suppressed|<([5-9]|[1-9][0-9]|100))$/) }).strict(),
]);

const aggregateSchema = z.object({
  schemaVersion: z.literal("agape.profiling.aggregate.v2"),
  cycle: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(160),
    status: z.enum(["draft", "collecting", "validating", "completed", "archived"]),
    reportingDate: z.string().date(),
  }).strict(),
  sample: z.object({
    method: z.string().trim().min(2).max(160),
    targetHouseholds: z.number().int().positive(),
    registeredHouseholds: z.number().int().nonnegative(),
    participatingHouseholds: z.number().int().nonnegative(),
    approvedHouseholds: z.number().int().nonnegative(),
    approvedResidents: z.number().int().nonnegative(),
    coveragePercent: z.number().min(0).max(100).nullable(),
    responseRatePercent: z.number().min(0).max(100).nullable(),
  }).strict(),
  source: z.object({
    kind: z.literal("approved_sample"),
    legacyExcluded: z.literal(true),
    evidenceSnapshotId: z.string().uuid().nullable(),
  }).strict(),
  official: z.object({
    totalPopulation: z.number().int().nonnegative().nullable(),
    totalHouseholds: z.number().int().nonnegative().nullable(),
    sourceName: z.string().trim().min(2).max(200).nullable(),
    asOfDate: z.string().date().nullable(),
    verified: z.boolean(),
  }).strict(),
  asOf: z.string().datetime({ offset: true }),
  privacy: z.object({ suppressionThreshold: z.number().int().min(5).max(100), complementarySuppression: z.literal(true) }).strict(),
  dataQuality: z.object({
    pendingPackages: z.number().int().nonnegative(),
    returnedPackages: z.number().int().nonnegative(),
    excludedPackages: z.number().int().nonnegative(),
    unresolvedDuplicates: z.number().int().nonnegative(),
  }).strict(),
  cells: z.array(z.object({
    dimension: z.enum(["sex", "age_group", "sitio", "education", "employment", "household_income", "needs", "vulnerability"]),
    key: z.string().regex(/^[a-z0-9_.-]{1,80}$/),
    count: suppressedCountSchema,
  }).strict()).max(500),
}).strict();

export function normalizeSuppressionThreshold(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < MINIMUM_SUPPRESSION_THRESHOLD || parsed > 100) {
    throw new Error(`Suppression threshold must be an integer from ${MINIMUM_SUPPRESSION_THRESHOLD} to 100`);
  }
  return parsed;
}

export function suppressCount(value: number, threshold = MINIMUM_SUPPRESSION_THRESHOLD): SuppressedCount {
  const k = normalizeSuppressionThreshold(threshold);
  if (value > 0 && value < k) return { suppressed: true, value: null, label: `<${k}` };
  return { suppressed: false, value, label: String(value) };
}

/** A lone small cell is removed with its entire dimension; otherwise one peer is hidden. */
export function applyComplementarySuppression(values: number[], threshold = MINIMUM_SUPPRESSION_THRESHOLD): SuppressedCount[] {
  const result = values.map((value) => suppressCount(value, threshold));
  const hidden = result.filter((cell) => cell.suppressed).length;
  if (hidden === 1) {
    const peer = values.map((value, index) => ({ value, index })).filter(({ value }) => value >= threshold).sort((a, b) => a.value - b.value)[0];
    if (peer) result[peer.index] = { suppressed: true, value: null, label: "suppressed" };
  }
  return result;
}

export function validateProfilingAggregateDTO(input: unknown): ProfilingAggregateDTO {
  return aggregateSchema.parse(input) as ProfilingAggregateDTO;
}

export function enforceAggregateComplementarySuppression(input: unknown): ProfilingAggregateDTO {
  const dto = validateProfilingAggregateDTO(input);
  let cells = dto.cells.map((cell) => ({ ...cell, count: { ...cell.count } }));
  for (const dimension of Array.from(new Set(cells.map((cell) => cell.dimension)))) {
    const group = cells.filter((cell) => cell.dimension === dimension);
    if (group.filter((cell) => cell.count.suppressed).length !== 1) continue;
    const peer = group.filter((cell) => !cell.count.suppressed).sort((a, b) => (a.count.value ?? Number.MAX_SAFE_INTEGER) - (b.count.value ?? Number.MAX_SAFE_INTEGER))[0];
    if (peer) peer.count = { suppressed: true, value: null, label: "suppressed" };
    else cells = cells.filter((cell) => cell.dimension !== dimension);
  }
  return validateProfilingAggregateDTO({ ...dto, cells });
}
