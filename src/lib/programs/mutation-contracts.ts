/** Pure allowlist contracts for program and program-budget writes. */

export const PROGRAM_CONTENT_FIELDS = [
  "title",
  "description",
  "barangay_id",
  "start_date",
  "end_date",
  "status",
  "max_volunteers",
] as const;

export const PROGRAM_STATUSES = [
  "draft",
  "planning",
  "upcoming",
  "active",
  "completed",
  "cancelled",
] as const;

export const PROGRAM_BUDGET_CONTENT_FIELDS = [
  "category",
  "allocated",
  "spent",
  "notes",
] as const;

export const PROGRAM_ACTIVITY_STATUSES = [
  "planned",
  "ongoing",
  "completed",
  "cancelled",
] as const;

export const PROGRAM_ACTIVITY_CREATE_FIELDS = [
  "title",
  "description",
  "date",
  "location",
  "status",
] as const;

export const PROGRAM_ACTIVITY_UPDATE_FIELDS = [
  ...PROGRAM_ACTIVITY_CREATE_FIELDS,
  "report_1",
  "report_2",
] as const;

export const PROGRAM_ACTIVITY_PROTECTED_FIELDS = [
  "id",
  "program_id",
  "created_by",
  "created_at",
  "updated_at",
  "approval_status",
  "approved_by",
  "approved_at",
  "approval_notes",
  "attendance_otp",
  "attendance_otp_expires_at",
  "attendance_otp_issued_at",
  "attendance_otp_issued_by",
  "volunteer_count",
  "beneficiary_count",
] as const;

export interface ProgramContentInput {
  title?: string;
  description?: string | null;
  barangay_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: (typeof PROGRAM_STATUSES)[number];
  max_volunteers?: number | null;
}

export interface ProgramBudgetContentInput {
  category: string;
  allocated: number;
  spent: number;
  notes: string | null;
}

export interface ProgramActivityContentInput {
  title?: string;
  description?: string | null;
  date?: string | null;
  location?: string | null;
  status?: (typeof PROGRAM_ACTIVITY_STATUSES)[number];
  report_1?: string | null;
  report_2?: string | null;
}

export type ProgramMutationContractResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PROGRAM_FIELD_SET = new Set<string>(PROGRAM_CONTENT_FIELDS);
const BUDGET_FIELD_SET = new Set<string>(PROGRAM_BUDGET_CONTENT_FIELDS);
const STATUS_SET = new Set<string>(PROGRAM_STATUSES);
const ACTIVITY_CREATE_FIELD_SET = new Set<string>(PROGRAM_ACTIVITY_CREATE_FIELDS);
const ACTIVITY_UPDATE_FIELD_SET = new Set<string>(PROGRAM_ACTIVITY_UPDATE_FIELDS);
const ACTIVITY_STATUS_SET = new Set<string>(PROGRAM_ACTIVITY_STATUSES);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): ProgramMutationContractResult<string | null> {
  if (value === null) return { ok: true, data: null };
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string or null.` };
  }
  const normalized = value.trim();
  if (!normalized) return { ok: true, data: null };
  if (normalized.length > maxLength) {
    return { ok: false, error: `${field} must be at most ${maxLength} characters.` };
  }
  return { ok: true, data: normalized };
}

function title(value: unknown): ProgramMutationContractResult<string> {
  if (typeof value !== "string") {
    return { ok: false, error: "title must be a string." };
  }
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.length > 300) {
    return { ok: false, error: "title must contain 3-300 characters." };
  }
  return { ok: true, data: normalized };
}

function optionalDate(value: unknown, field: string): ProgramMutationContractResult<string | null> {
  if (value === null || value === "") return { ok: true, data: null };
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return { ok: false, error: `${field} must use YYYY-MM-DD format or be null.` };
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: `${field} is not a valid calendar date.` };
  }
  return { ok: true, data: value };
}

function parseProgramContent(
  input: unknown,
  mode: "create" | "update",
): ProgramMutationContractResult<ProgramContentInput> {
  if (!isRecord(input)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const unknown = Object.keys(input).filter((field) => !PROGRAM_FIELD_SET.has(field));
  if (unknown.length > 0) {
    return { ok: false, error: `Unexpected or protected field(s): ${unknown.join(", ")}.` };
  }

  const output: ProgramContentInput = {};
  if (mode === "create" || Object.hasOwn(input, "title")) {
    const parsed = title(input.title);
    if (!parsed.ok) return parsed;
    output.title = parsed.data;
  }

  if (Object.hasOwn(input, "description")) {
    const parsed = optionalText(input.description, "description", 20_000);
    if (!parsed.ok) return parsed;
    output.description = parsed.data;
  }

  if (Object.hasOwn(input, "barangay_id")) {
    if (input.barangay_id === null || input.barangay_id === "") {
      output.barangay_id = null;
    } else if (typeof input.barangay_id === "string" && UUID_PATTERN.test(input.barangay_id)) {
      output.barangay_id = input.barangay_id;
    } else {
      return { ok: false, error: "barangay_id must be a UUID or null." };
    }
  }

  for (const field of ["start_date", "end_date"] as const) {
    if (!Object.hasOwn(input, field)) continue;
    const parsed = optionalDate(input[field], field);
    if (!parsed.ok) return parsed;
    output[field] = parsed.data;
  }
  if (output.start_date && output.end_date && output.end_date < output.start_date) {
    return { ok: false, error: "end_date cannot be before start_date." };
  }

  if (Object.hasOwn(input, "status")) {
    if (typeof input.status !== "string" || !STATUS_SET.has(input.status)) {
      return { ok: false, error: `status must be one of: ${PROGRAM_STATUSES.join(", ")}.` };
    }
    output.status = input.status as ProgramContentInput["status"];
  }

  if (Object.hasOwn(input, "max_volunteers")) {
    const value = input.max_volunteers;
    if (value !== null && (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100_000)) {
      return { ok: false, error: "max_volunteers must be an integer from 0 to 100000 or null." };
    }
    output.max_volunteers = value as number | null;
  }

  if (mode === "create" && !Object.hasOwn(output, "status")) output.status = "draft";
  if (mode === "update" && Object.keys(output).length === 0) {
    return { ok: false, error: "At least one program content field is required." };
  }
  return { ok: true, data: output };
}

export function parseProgramCreateInput(input: unknown): ProgramMutationContractResult<ProgramContentInput> {
  return parseProgramContent(input, "create");
}

export function parseProgramUpdateInput(input: unknown): ProgramMutationContractResult<ProgramContentInput> {
  return parseProgramContent(input, "update");
}

export function parseProgramBudgetCreateInput(
  input: unknown,
): ProgramMutationContractResult<ProgramBudgetContentInput> {
  if (!isRecord(input)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const unknown = Object.keys(input).filter((field) => !BUDGET_FIELD_SET.has(field));
  if (unknown.length > 0) {
    return { ok: false, error: `Unexpected or protected field(s): ${unknown.join(", ")}.` };
  }

  const category = optionalText(input.category, "category", 200);
  if (!category.ok) return category;
  if (!category.data) return { ok: false, error: "category is required." };

  const allocated = input.allocated;
  if (typeof allocated !== "number" || !Number.isFinite(allocated) || allocated < 0) {
    return { ok: false, error: "allocated must be a non-negative number." };
  }

  const spent = input.spent ?? 0;
  if (typeof spent !== "number" || !Number.isFinite(spent) || spent < 0) {
    return { ok: false, error: "spent must be a non-negative number." };
  }

  const notes = optionalText(input.notes ?? null, "notes", 10_000);
  if (!notes.ok) return notes;

  return {
    ok: true,
    data: { category: category.data, allocated, spent, notes: notes.data },
  };
}

function activityTitle(value: unknown): ProgramMutationContractResult<string> {
  if (typeof value !== "string") {
    return { ok: false, error: "title must be a string." };
  }
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 300) {
    return { ok: false, error: "title must contain 2-300 characters." };
  }
  return { ok: true, data: normalized };
}

function parseProgramActivityContent(
  input: unknown,
  mode: "create" | "update",
): ProgramMutationContractResult<ProgramActivityContentInput> {
  if (!isRecord(input)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const allowedFields = mode === "create" ? ACTIVITY_CREATE_FIELD_SET : ACTIVITY_UPDATE_FIELD_SET;
  const unknown = Object.keys(input).filter((field) => !allowedFields.has(field));
  if (unknown.length > 0) {
    return { ok: false, error: `Unexpected or protected field(s): ${unknown.join(", ")}.` };
  }

  const output: ProgramActivityContentInput = {};
  if (mode === "create" || Object.hasOwn(input, "title")) {
    const parsed = activityTitle(input.title);
    if (!parsed.ok) return parsed;
    output.title = parsed.data;
  }

  const textFields = [
    ["description", 20_000],
    ["location", 1_000],
    ["report_1", 50_000],
    ["report_2", 50_000],
  ] as const;
  for (const [field, maxLength] of textFields) {
    if (!Object.hasOwn(input, field)) continue;
    const parsed = optionalText(input[field], field, maxLength);
    if (!parsed.ok) return parsed;
    output[field] = parsed.data;
  }

  if (Object.hasOwn(input, "date")) {
    const parsed = optionalDate(input.date, "date");
    if (!parsed.ok) return parsed;
    output.date = parsed.data;
  }

  if (Object.hasOwn(input, "status")) {
    if (typeof input.status !== "string" || !ACTIVITY_STATUS_SET.has(input.status)) {
      return {
        ok: false,
        error: `status must be one of: ${PROGRAM_ACTIVITY_STATUSES.join(", ")}.`,
      };
    }
    output.status = input.status as ProgramActivityContentInput["status"];
  } else if (mode === "create") {
    output.status = "planned";
  }

  if (mode === "update" && Object.keys(output).length === 0) {
    return { ok: false, error: "At least one activity content field is required." };
  }

  return { ok: true, data: output };
}

export function parseProgramActivityCreateInput(
  input: unknown,
): ProgramMutationContractResult<ProgramActivityContentInput> {
  return parseProgramActivityContent(input, "create");
}

export function parseProgramActivityUpdateInput(
  input: unknown,
): ProgramMutationContractResult<ProgramActivityContentInput> {
  return parseProgramActivityContent(input, "update");
}
