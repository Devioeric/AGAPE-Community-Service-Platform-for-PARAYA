import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const nullableDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date").nullable();

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

export type PartnershipHistoryRow = {
  id: string;
  event_type: string;
  description?: string | null;
  notes?: string | null;
  event_date?: string | null;
  date?: string | null;
  created_at?: string | null;
  officer?: { full_name?: string | null } | null;
};

export type PartnershipProgramSummary = {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

export type PartnershipDetail = ReturnType<typeof partnershipDto> & {
  partnership_history: Array<{
    id: string;
    event_type: string;
    description: string | null;
    notes: string | null;
    event_date: string | null;
    date: string | null;
    created_at: string | null;
    officer_name: string | null;
  }>;
  programs?: PartnershipProgramSummary[];
};

const partnershipHistorySchema = z.object({
  id: z.string().min(1),
  event_type: z.string().min(1),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  event_date: nullableDate,
  date: nullableDate,
  created_at: nullableDate,
  officer_name: z.string().nullable(),
}).strict();

const partnershipProgramSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  start_date: nullableDate,
  end_date: nullableDate,
}).strict();

export const partnershipDetailSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  municipality: z.string().nullable(),
  province: z.string().nullable(),
  contact_person: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_email: z.string().nullable(),
  total_population: z.number().int().nonnegative().nullable(),
  total_households: z.number().int().nonnegative().nullable(),
  partnership_start: nullableDate,
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  is_active: z.boolean(),
  created_at: nullableDate,
  updated_at: nullableDate,
  partnership_history: z.array(partnershipHistorySchema),
  programs: z.array(partnershipProgramSummarySchema).optional(),
}).strict();

export function partnershipHistoryDto(row: PartnershipHistoryRow) {
  return {
    id: row.id,
    event_type: row.event_type,
    description: row.description ?? null,
    notes: row.notes ?? null,
    event_date: row.event_date ?? null,
    date: row.date ?? null,
    created_at: row.created_at ?? null,
    officer_name: row.officer?.full_name ?? null,
  };
}

export function partnershipProgramSummaryDto(row: PartnershipProgramSummary): PartnershipProgramSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
  };
}

export function partnershipDto(row: PartnershipRow) {
  return {
    id: row.id, name: row.name, municipality: row.municipality, province: row.province,
    contact_person: row.contact_person, contact_phone: row.contact_phone, contact_email: row.contact_email,
    total_population: row.total_population, total_households: row.total_households,
    partnership_start: row.partnership_start, latitude: row.latitude, longitude: row.longitude,
    is_active: row.is_active, created_at: row.created_at ?? null, updated_at: row.updated_at ?? null,
  };
}
