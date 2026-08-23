import { z } from "zod";

const uuidOrNull = z.string().uuid().optional().nullable();
const shortText = (min = 1, max = 200) => z.string().trim().min(min).max(max);

export const donationInputSchema = z.object({
  donor_name: shortText(2, 160), donor_type: z.enum(["individual","organization","corporate","government","anonymous"]),
  item_type: shortText(2, 120), quantity: z.coerce.number().positive().max(1_000_000), unit: shortText(1, 30),
  received_date: z.string().date(), program_id: uuidOrNull, barangay_id: uuidOrNull, notes: z.string().trim().max(1000).optional().nullable(),
}).strict();
export const donationUpdateSchema = donationInputSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const donationDistributionSchema = z.object({
  distributed_to: shortText(2, 200), quantity: z.coerce.number().positive().max(1_000_000),
  distribution_date: z.string().date(), distribution_type: z.enum(["regular","disaster"]), notes: z.string().trim().max(1000).optional().nullable(),
}).strict();

export const impactIndicatorSchema = z.object({
  program_id: z.string().uuid(), indicator_type: z.enum(["beneficiaries_reached","families_served","trainings_conducted","materials_distributed","volunteer_hours","custom"]),
  value: z.coerce.number().nonnegative().max(1_000_000_000), unit: shortText(1, 50), recorded_date: z.string().date(), notes: z.string().trim().max(2000).optional().nullable(),
}).strict();
export const impactQualitativeSchema = z.object({
  program_id: z.string().uuid(), type: z.enum(["testimonial","case_study","pre_post_narrative","observation"]),
  content: shortText(10, 10000), subject_name: z.string().trim().max(160).optional().nullable(),
  subject_consent_confirmed: z.boolean().default(false), recorded_date: z.string().date(),
}).strict().superRefine((value, ctx) => {
  if (value.subject_name && !value.subject_consent_confirmed) ctx.addIssue({ code: "custom", path: ["subject_consent_confirmed"], message: "Named qualitative subjects require recorded consent" });
});
export const followUpCreateSchema = z.object({
  program_id: z.string().uuid(), followup_type: z.enum(["immediate","6_month","12_month"]),
  scheduled_date: z.string().date(), notes: z.string().trim().max(2000).optional().nullable(),
}).strict();
export const followUpTransitionSchema = z.object({
  expected_status: z.enum(["scheduled","in_progress","completed","overdue"]),
  status: z.enum(["scheduled","in_progress","completed","overdue"]),
  notes: z.string().trim().max(2000).optional().nullable(), completed_date: z.string().date().optional().nullable(),
}).strict().superRefine((value, ctx) => {
  const allowed = value.expected_status === value.status ||
    (value.expected_status === "scheduled" && ["in_progress","overdue"].includes(value.status)) ||
    (value.expected_status === "in_progress" && value.status === "completed") ||
    (value.expected_status === "overdue" && ["in_progress","completed"].includes(value.status));
  if (!allowed) ctx.addIssue({ code: "custom", path: ["status"], message: "Invalid follow-up transition" });
  if (value.status === "completed" && !value.completed_date) ctx.addIssue({ code: "custom", path: ["completed_date"], message: "Completion date is required" });
});

const questionSchema = z.object({
  question_text: shortText(1, 2000), question_type: z.enum(["text","multiple_choice","checkbox","rating"]),
  options: z.array(z.string().trim().min(1).max(300)).max(100).default([]), is_required: z.boolean().default(false),
  section_title: z.string().trim().max(200).optional().nullable(),
  conditions: z.object({ on_question_index: z.number().int().nonnegative(), on_value: z.string().max(300) }).strict().optional().nullable(),
  order_index: z.number().int().nonnegative().optional(),
}).strict();
export const surveyMutationSchema = z.object({
  title: shortText(2, 240), description: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(["draft","published","closed"]).default("draft"), target_barangay_id: uuidOrNull,
  program_id: uuidOrNull, opens_at: z.string().datetime().optional().nullable(), closes_at: z.string().datetime().optional().nullable(),
  is_anonymous: z.boolean().default(false), is_editable: z.boolean().default(false), reminder_enabled: z.boolean().default(false),
  submission_type: z.enum(["once","multiple"]).default("once"), methodology: z.enum(["quantitative","qualitative","mixed"]).default("quantitative"),
  parent_survey_id: uuidOrNull,
  questions: z.array(questionSchema).min(1).max(200),
}).strict();
export const surveyAnswerSchema = z.object({ question_id: z.string().uuid(), answer_text: z.string().max(10000).optional().nullable(), answer_options: z.array(z.string().max(1000)).max(100).optional().nullable() }).strict();
export const surveyResponseSchema = z.object({ answers: z.array(surveyAnswerSchema).min(1).max(200) }).strict();
