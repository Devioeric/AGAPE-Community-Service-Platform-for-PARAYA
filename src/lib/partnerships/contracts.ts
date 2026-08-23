import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const partnershipWriteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  municipality: z.string().trim().min(2).max(120).default("Bocaue"),
  province: z.string().trim().min(2).max(120).default("Bulacan"),
  contact_person: nullableText(160),
  contact_phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,24}$/).nullable().optional(),
  contact_email: z.string().trim().email().max(254).nullable().optional(),
  total_population: z.number().int().nonnegative().max(10_000_000).nullable().optional(),
  total_households: z.number().int().nonnegative().max(5_000_000).nullable().optional(),
  partnership_start: z.string().date().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).strict();

export type PartnershipRow = {
  id: string; name: string; municipality: string | null; province: string | null;
  contact_person: string | null; contact_phone: string | null; contact_email: string | null;
  total_population: number | null; total_households: number | null; partnership_start: string | null;
  latitude: number | null; longitude: number | null; is_active: boolean;
  created_at?: string | null; updated_at?: string | null;
};

export function partnershipDto(row: PartnershipRow) {
  return {
    id: row.id, name: row.name, municipality: row.municipality, province: row.province,
    contact_person: row.contact_person, contact_phone: row.contact_phone, contact_email: row.contact_email,
    total_population: row.total_population, total_households: row.total_households,
    partnership_start: row.partnership_start, latitude: row.latitude, longitude: row.longitude,
    is_active: row.is_active, created_at: row.created_at ?? null, updated_at: row.updated_at ?? null,
  };
}
