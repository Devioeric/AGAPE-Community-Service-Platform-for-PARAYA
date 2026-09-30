import { z } from "zod";

export const reportChangeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("correct"), expected_version: z.number().int().positive(),
    narrative: z.string().trim().min(20).max(50_000), reason: z.string().trim().min(5).max(2_000), report_document: z.unknown().optional() }).strict(),
  z.object({ action: z.literal("return"), expected_version: z.number().int().positive(), reason: z.string().trim().min(5).max(2_000) }).strict(),
  z.object({ action: z.literal("archive"), expected_version: z.number().int().positive(), reason: z.string().trim().min(5).max(1_000) }).strict(),
  z.object({ action: z.literal("review"), expected_version: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("approve"), expected_version: z.number().int().positive() }).strict(),
]);

export function retainedWriteFailure(code?: string) {
  if (code === "40001" || code === "23505") return { status: 409, error: "This record changed. Reload the latest version before trying again; your changes were not saved." };
  if (code === "42501") return { status: 403, error: "You do not have permission to change this record." };
  if (code === "P0002") return { status: 404, error: "This record is no longer available." };
  if (["22023", "23514"].includes(code ?? "")) return { status: 422, error: "This change is not allowed for the current record state." };
  return { status: 503, error: "The change could not be saved. Please try again." };
}
