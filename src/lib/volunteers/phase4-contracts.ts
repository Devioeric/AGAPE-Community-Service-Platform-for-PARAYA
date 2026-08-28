import { z } from "zod";

const uuid = z.string().uuid();
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const availabilityWindowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict().refine((value) => value.startTime < value.endTime, {
  message: "Availability end time must be after its start time.",
  path: ["endTime"],
});

const approximateLocationSchema = z.object({
  consent: z.boolean(),
  barangayId: uuid.nullable(),
  sitioId: uuid.nullable(),
  approximateLatitude: z.number().min(-90).max(90).nullable(),
  approximateLongitude: z.number().min(-180).max(180).nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.approximateLatitude === null) !== (value.approximateLongitude === null)) {
    ctx.addIssue({ code: "custom", path: ["approximateLongitude"], message: "Provide both approximate coordinates." });
  }
  if (!value.consent && (value.barangayId || value.sitioId ||
      value.approximateLatitude !== null || value.approximateLongitude !== null)) {
    ctx.addIssue({ code: "custom", path: ["consent"], message: "Location data requires consent." });
  }
});

export const VOLUNTEER_SKILL_CODES = [
  "community_facilitation", "data_collection", "documentation", "education_tutoring",
  "event_management", "first_aid", "food_preparation", "graphic_design",
  "logistics", "performing_arts", "photography_video", "public_speaking",
  "social_media", "sports_coaching", "technology_support", "writing_editing",
] as const;

export const volunteerPreferencesInputSchema = z.object({
  expectedVersion: z.number().int().positive().nullable(),
  skills: z.array(z.enum(VOLUNTEER_SKILL_CODES)).max(16),
  availability: z.array(availabilityWindowSchema).max(28),
  location: approximateLocationSchema,
}).strict();

export const programMatchingSetupSchema = z.object({
  expectedVersion: z.number().int().positive().nullable(),
  requiredSkills: z.array(z.enum(VOLUNTEER_SKILL_CODES)).max(16),
  allowedCourses: z.array(boundedText(80)).max(30),
  minimumYearLevel: z.number().int().min(1).max(6).nullable(),
  maximumYearLevel: z.number().int().min(1).max(6).nullable(),
  signupDeadline: z.string().datetime({ offset: true }).nullable(),
  site: z.object({
    venueName: boundedText(160),
    barangayId: uuid,
    sitioId: uuid.nullable(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    radiusKm: z.number().min(0.5).max(100),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.minimumYearLevel && value.maximumYearLevel && value.minimumYearLevel > value.maximumYearLevel) {
    ctx.addIssue({ code: "custom", path: ["maximumYearLevel"], message: "Maximum year level must be at least the minimum." });
  }
  if (value.site.startsAt >= value.site.endsAt) {
    ctx.addIssue({ code: "custom", path: ["site", "endsAt"], message: "Site end time must be after its start time." });
  }
});

export const createProgramInvitationSchema = z.object({
  label: z.string().trim().max(80).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }),
  maxUses: z.number().int().min(1).max(10000),
  allowedEmailDomain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/).max(120).default("dyci.edu.ph"),
  allowExternalEmail: z.boolean().default(false),
  externalExceptionReason: z.string().trim().min(10).max(500).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.allowExternalEmail && !value.externalExceptionReason) {
    ctx.addIssue({ code: "custom", path: ["externalExceptionReason"], message: "An exception reason is required." });
  }
});

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const invitationJoinSchema = z.object({ token: invitationTokenSchema }).strict();
export const programLeaderSetSchema = z.object({
  expectedVersion: z.number().int().positive(),
  volunteerIds: z.array(uuid).max(10).refine(
    (values) => new Set(values).size === values.length,
    "Program leaders must be unique."
  ),
}).strict();
export const waitlistDecisionSchema = z.object({
  action: z.enum(["approve", "decline"]),
  expectedVersion: z.number().int().positive(),
  remarks: z.string().trim().max(500).nullable().optional(),
}).strict();

export type VolunteerPreferencesInput = z.infer<typeof volunteerPreferencesInputSchema>;
export type ProgramMatchingSetupInput = z.infer<typeof programMatchingSetupSchema>;
export type CreateProgramInvitationInput = z.infer<typeof createProgramInvitationSchema>;

export function phase4MatchingEnabled() {
  return process.env.AGAPE_VOLUNTEER_MATCHING_V2_ENABLED === "true";
}

export function phase4InvitationsEnabled() {
  return process.env.AGAPE_PROGRAM_INVITATIONS_V2_ENABLED === "true";
}
