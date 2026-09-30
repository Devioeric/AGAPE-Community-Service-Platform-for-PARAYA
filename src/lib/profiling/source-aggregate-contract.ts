import { z } from "zod";

const availability = z.enum(["available", "empty", "unavailable", "suppressed"]);

export const sourceAggregateDatasetSchema = z.object({
  id: z.string().uuid(),
  cycleId: z.string().uuid(),
  barangayId: z.string().uuid(),
  sitioId: z.string().uuid(),
  aggregateSchemaVersion: z.string(),
  sourceTitle: z.string(),
  sourceLocation: z.string(),
  sourceFiles: z.array(z.string()),
  sourceHashes: z.record(z.string(), z.string()),
  sourceBundleHash: z.string(),
  sourceRowCount: z.number().int().nonnegative(),
  status: z.enum(["imported", "superseded"]),
  qualityFlags: z.array(z.string()),
  provenance: z.record(z.string(), z.unknown()),
  importedAt: z.string().nullable().optional(),
}).strict();

export const sourceAggregateRowSchema = z.object({
  id: z.string().uuid(),
  sourceRecordId: z.string(),
  recordType: z.string(),
  section: z.string().nullable(),
  subsection: z.string().nullable(),
  topic: z.string().nullable(),
  category: z.string().nullable(),
  frequency: z.number().nullable(),
  percentage: z.number().nullable(),
  percentageAsPrinted: z.string().nullable(),
  reportedTableTotal: z.number().nullable(),
  multipleResponses: z.string().nullable(),
  description: z.string().nullable(),
  representativeNotes: z.string().nullable(),
  sourcePage: z.string().nullable(),
  tableId: z.string().nullable(),
  originalTableHeader: z.string().nullable(),
  dataQualityNotes: z.string().nullable(),
  sourceFile: z.string().nullable(),
}).strict();

export const sourceAggregateResponseSchema = z.object({
  dataset: sourceAggregateDatasetSchema.nullable(),
  rows: z.array(sourceAggregateRowSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(500),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
  availability,
  warnings: z.array(z.string()),
}).strict();

export type SourceAggregateDataset = z.infer<typeof sourceAggregateDatasetSchema>;
export type SourceAggregateRow = z.infer<typeof sourceAggregateRowSchema>;
export type SourceAggregateResponse = z.infer<typeof sourceAggregateResponseSchema>;

export function parseSourceAggregateResponse(value: unknown): SourceAggregateResponse {
  return sourceAggregateResponseSchema.parse(value);
}
