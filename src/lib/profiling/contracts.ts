import { z } from "zod";

export const PROFILING_TEMPLATE_VERSION = "AGAPE-PROFILING-V1";
export const PROFILING_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const PROFILING_MAX_IMPORT_ROWS = 10_000;
export const OPAQUE_SAMPLE_REFERENCE_PATTERN = /^SMP-[A-Z0-9]{8,32}$/;

export const HOUSEHOLD_IMPORT_FIELDS = ["template_version","household_row_key","sample_reference","sitio_id","participation_consent","household_consent_name","privacy_notice_version","landmark","contact_number","income_bracket","housing_condition","electricity","water_source","sanitation","internet_access","devices","hazards","needs","anonymous_nonparticipant_count"] as const;
export const RESIDENT_IMPORT_FIELDS = ["household_row_key","resident_id","first_name","middle_name","last_name","suffix","birth_date","estimated_age","sex","civil_status","relationship_to_head","education_level","is_enrolled","school_category","employment_status","occupation_category","income_bracket","skills","disability_support","health_support","pregnancy_status","pregnancy_effective_from","pregnancy_effective_to","is_solo_parent","is_4ps_member","planning_needs","consent_status","guardian_name","guardian_relationship"] as const;

export const PROHIBITED_PROFILE_KEYS = [
  "government_id", "government_id_number", "national_id", "passport",
  "national_id_number", "voter_id", "senior_id", "pwd_id", "solo_parent_id", "four_ps_id", "4ps_id",
  "photo", "photo_url", "photograph", "image", "biometric", "fingerprint", "face_scan", "exact_gps", "gps",
  "coordinates", "coordinate", "location_coordinates",
  "latitude", "longitude", "exact_income", "monthly_income_amount",
  "diagnosis", "diagnoses", "medical_notes", "clinical_notes", "clinical_document", "medical_document", "password", "password_hash",
] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const controlledText = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).optional().nullable();

export const householdProfileSchema = z.object({
  sitio_id: z.string().uuid(),
  landmark: optionalText(160),
  contact_number: z.string().trim().regex(/^\+?[0-9 -]{7,20}$/).optional().nullable(),
  income_bracket: controlledText(["below_5000", "5000_9999", "10000_19999", "20000_39999", "40000_59999", "60000_plus", "not_stated"]),
  housing_condition: controlledText(["adequate", "needs_minor_repair", "needs_major_repair", "temporary", "not_stated"]),
  electricity: controlledText(["connected", "shared", "none", "not_stated"]),
  water_source: controlledText(["piped", "well", "delivered", "communal", "other", "not_stated"]),
  sanitation: controlledText(["private_flush", "shared_flush", "latrine", "none", "not_stated"]),
  internet_access: controlledText(["fixed", "mobile", "shared", "none", "not_stated"]),
  devices: z.array(z.enum(["smartphone", "basic_phone", "tablet", "laptop", "desktop", "television", "radio"])).max(7).default([]),
  hazards: z.array(z.enum(["flood", "fire", "landslide", "extreme_heat", "unsafe_structure", "other"])).max(6).default([]),
  needs: z.array(z.enum(["health", "education", "livelihood", "housing", "sanitation", "disaster_readiness", "digital_access", "other"])).max(8).default([]),
  anonymous_nonparticipant_count: z.number().int().min(0).max(100).default(0),
}).strict();

export const residentProfileSchema = z.object({
  resident_id: z.string().uuid().optional().nullable(),
  household_row_key: z.string().trim().min(1).max(80),
  first_name: z.string().trim().min(1).max(80),
  middle_name: optionalText(80),
  last_name: z.string().trim().min(1).max(80),
  suffix: optionalText(20),
  birth_date: z.string().date().optional().nullable(),
  estimated_age: z.number().int().min(0).max(125).optional().nullable(),
  sex: controlledText(["female", "male", "intersex", "not_stated"]),
  civil_status: controlledText(["single", "married", "cohabiting", "separated", "widowed", "not_stated"]),
  relationship_to_head: controlledText(["household_head", "spouse_partner", "child", "parent", "sibling", "relative", "non_relative", "other"]),
  education_level: controlledText(["none", "early_childhood", "elementary", "junior_high", "senior_high", "technical_vocational", "college", "postgraduate", "not_stated"]),
  is_enrolled: z.boolean().optional().nullable(),
  school_category: controlledText(["public", "private", "alternative_learning", "not_stated"]),
  employment_status: controlledText(["employed", "self_employed", "unemployed_seeking", "not_seeking", "student", "retired", "not_stated"]),
  occupation_category: controlledText(["not_stated", "agriculture", "fishing", "construction", "manufacturing", "transport", "retail", "food_service", "education", "health_care", "public_service", "domestic_work", "technology", "professional", "informal_labor", "unemployed", "student", "retired", "other"]),
  income_bracket: controlledText(["none", "below_5000", "5000_9999", "10000_19999", "20000_plus", "not_stated"]),
  skills: z.array(z.enum(["agriculture", "food_preparation", "sewing", "handicraft", "carpentry", "electrical", "plumbing", "caregiving", "teaching", "digital_literacy", "computer_technical", "entrepreneurship", "driving", "community_organizing", "disaster_response", "first_aid", "other"])).max(17).default([]),
  disability_support: z.array(z.enum(["mobility", "vision", "hearing", "communication", "cognitive", "psychosocial", "self_care", "other"])).max(8).default([]),
  health_support: z.array(z.enum(["maternal", "child_nutrition", "maintenance_medicine", "mobility_support", "mental_wellbeing", "other"])).max(6).default([]),
  pregnancy_status: z.boolean().optional().nullable(),
  pregnancy_effective_from: z.string().date().optional().nullable(),
  pregnancy_effective_to: z.string().date().optional().nullable(),
  is_solo_parent: z.boolean().optional().nullable(),
  is_4ps_member: z.boolean().optional().nullable(),
  planning_needs: z.array(z.enum(["health", "education", "livelihood", "accessibility", "digital_access", "other"])).max(6).default([]),
  consent_status: z.enum(["granted", "refused", "withdrawn"]),
  guardian_name: optionalText(160),
  guardian_relationship: optionalText(60),
}).strict().superRefine((value, ctx) => {
  if (!value.birth_date && value.estimated_age == null) {
    ctx.addIssue({ code: "custom", path: ["estimated_age"], message: "Birth date or estimated age is required" });
  }
  if (value.consent_status !== "granted") {
    ctx.addIssue({ code: "custom", path: ["consent_status"], message: "Identifiable resident records require granted consent" });
  }
});

export const profilingPackageSchema = z.object({
  cycle_id: z.string().uuid(),
  household_row_key: z.string().trim().min(1).max(80),
  participation_consent: z.literal("granted"),
  household_consent_name: z.string().trim().min(1).max(160),
  privacy_notice_version: z.string().trim().min(1).max(40),
  sample_reference: z.string().trim().regex(OPAQUE_SAMPLE_REFERENCE_PATTERN),
  household: householdProfileSchema,
  residents: z.array(residentProfileSchema).max(100),
  expected_version: z.number().int().min(0),
}).strict().superRefine((value, ctx) => {
  if (value.residents.length === 0 && value.household.anonymous_nonparticipant_count === 0) {
    ctx.addIssue({ code: "custom", path: ["residents"], message: "A participating package requires a consented resident or an anonymous non-participation count" });
  }
});

function normalizedKey(key: string): string {
  return key.trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function deriveMinorStatus(birthDate: string | null, estimatedAge: number | null, asOfDate: string): boolean {
  const asOf = new Date(`${asOfDate}T00:00:00Z`);
  if (Number.isNaN(asOf.getTime())) throw new Error("A valid collection date is required");
  if (birthDate) {
    const birth = new Date(`${birthDate}T00:00:00Z`);
    if (Number.isNaN(birth.getTime()) || birth > asOf) throw new Error("Birth date must be valid and not after the collection date");
    let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
    const beforeBirthday = asOf.getUTCMonth() < birth.getUTCMonth() || (asOf.getUTCMonth() === birth.getUTCMonth() && asOf.getUTCDate() < birth.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age < 18;
  }
  if (estimatedAge === null || !Number.isInteger(estimatedAge) || estimatedAge < 0 || estimatedAge > 125) throw new Error("A valid birth date or estimated age is required");
  return estimatedAge < 18;
}

export function findProhibitedProfileKeys(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object") return [];
  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    const normalized = normalizedKey(key);
    if ((PROHIBITED_PROFILE_KEYS as readonly string[]).includes(normalized)) found.push(childPath);
    found.push(...findProhibitedProfileKeys(child, childPath));
  }
  return found;
}

export function parseProfilingPackage(input: unknown, asOfDate = new Date().toISOString().slice(0, 10)) {
  const prohibited = findProhibitedProfileKeys(input);
  if (prohibited.length) return { success: false as const, error: `Prohibited profiling fields: ${prohibited.join(", ")}` };
  const parsed = profilingPackageSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
  for (let index = 0; index < parsed.data.residents.length; index += 1) {
    const resident = parsed.data.residents[index];
    try {
      const minor = deriveMinorStatus(resident.birth_date ?? null, resident.estimated_age ?? null, asOfDate);
      if (minor && (!resident.guardian_name || !resident.guardian_relationship)) {
        return { success: false as const, error: `residents.${index}.guardian_name: A minor requires guardian authorization` };
      }
      if (!minor && (resident.guardian_name || resident.guardian_relationship)) {
        return { success: false as const, error: `residents.${index}.guardian_name: Adult consent cannot use guardian authorization` };
      }
      if (resident.birth_date && resident.estimated_age != null) {
        const birth = new Date(`${resident.birth_date}T00:00:00Z`);
        const asOf = new Date(`${asOfDate}T00:00:00Z`);
        let actualAge = asOf.getUTCFullYear() - birth.getUTCFullYear();
        if (asOf.getUTCMonth() < birth.getUTCMonth() || (asOf.getUTCMonth() === birth.getUTCMonth() && asOf.getUTCDate() < birth.getUTCDate())) actualAge -= 1;
        if (Math.abs(actualAge - resident.estimated_age) > 1) return { success: false as const, error: `residents.${index}.estimated_age: Birth date and estimated age conflict` };
      }
      const from = resident.pregnancy_effective_from ? new Date(`${resident.pregnancy_effective_from}T00:00:00Z`) : null;
      const to = resident.pregnancy_effective_to ? new Date(`${resident.pregnancy_effective_to}T00:00:00Z`) : null;
      const asOf = new Date(`${asOfDate}T00:00:00Z`);
      if (resident.pregnancy_status === true && (!from || from > asOf || (to && (to < from || to < asOf)))) {
        return { success: false as const, error: `residents.${index}.pregnancy_effective_from: Pregnancy effective dates are invalid` };
      }
      if (resident.pregnancy_status !== true && (from || to)) {
        return { success: false as const, error: `residents.${index}.pregnancy_status: Pregnancy dates require active status` };
      }
    } catch (error) {
      return { success: false as const, error: `residents.${index}: ${error instanceof Error ? error.message : "Invalid resident age"}` };
    }
  }
  return { success: true as const, data: parsed.data };
}
