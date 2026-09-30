import { z } from "zod";

const questionType = z.enum(["text", "multiple_choice", "checkbox", "rating"]);
const localId = z.string().min(1).max(100);
export const templateNameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const templateSaveSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).optional(),
  sections: z.array(z.object({
    localId, title: z.string().max(240), category: z.string().max(100), defaultQuestionType: questionType,
  }).strict()).max(100),
  questions: z.array(z.object({
    localId, question_text: z.string().max(2_000), question_type: questionType,
    options: z.array(z.string().max(500)).max(100), is_required: z.boolean(), section_local_id: localId,
    conditional_on: localId.optional(), conditional_value: z.string().max(500).optional(),
  }).strict()).max(500),
  expected_template_id: z.string().uuid().nullable().default(null),
  expected_version: z.number().int().positive().nullable().default(null),
  reason: z.string().trim().min(5).max(1_000).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.expected_template_id === null) !== (value.expected_version === null)) {
    ctx.addIssue({ code: "custom", message: "Both the current template and version are required" });
  }
  if (value.expected_template_id && !value.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Explain why the prior template is being superseded" });
  const sectionIds = new Set(value.sections.map(section => section.localId));
  const questionIds = new Set(value.questions.map(question => question.localId));
  if (sectionIds.size !== value.sections.length || questionIds.size !== value.questions.length || value.questions.some(question =>
    !sectionIds.has(question.section_local_id) || (question.conditional_on && (!questionIds.has(question.conditional_on) || question.conditional_on === question.localId)))) {
    ctx.addIssue({ code: "custom", message: "Invalid or duplicate template references" });
  }
});

export const templateArchiveSchema = z.object({
  expected_version: z.number().int().positive(), reason: z.string().trim().min(5).max(1_000),
}).strict();
