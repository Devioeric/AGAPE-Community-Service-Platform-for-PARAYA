/**
 * Pure request contracts for proposal content mutations.
 *
 * Workflow, ownership, finance, screening, validation, and audit fields are
 * deliberately absent. Those fields may only be changed by their dedicated
 * server-side actions.
 */

export const PROPOSAL_CONTENT_FIELDS = [
  "title",
  "rationale",
  "objectives",
  "target_beneficiaries",
  "expected_beneficiary_count",
  "expected_output",
  "timeline_start",
  "timeline_end",
  "budget",
  "barangay_id",
  "is_income_generating",
  "informed_by_proposals",
  "sdg_alignments",
] as const;

export const PROPOSAL_PROTECTED_FIELDS = [
  "id",
  "status",
  "created_by",
  "reviewed_by",
  "created_at",
  "updated_at",
  "finance_clearance",
  "finance_cleared_at",
  "finance_cleared_by",
  "finance_notes",
  "prescreening_passed",
  "prescreening_checks",
  "prescreening_ran_at",
  "community_validated",
  "community_validation_notes",
  "community_validated_at",
  "community_validated_by",
  "revision_count",
  "revision_requested_from",
] as const;

export interface ProposalSdgAlignmentInput {
  sdg_number: number;
  indicator: string | null;
}

export interface ProposalContentInput {
  title?: string;
  rationale?: string;
  objectives?: string | null;
  target_beneficiaries?: string | null;
  expected_beneficiary_count?: number | null;
  expected_output?: string | null;
  timeline_start?: string | null;
  timeline_end?: string | null;
  budget?: number | null;
  barangay_id?: string | null;
  is_income_generating?: boolean;
  informed_by_proposals?: string[];
  sdg_alignments?: ProposalSdgAlignmentInput[];
}

export type MutationContractResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const CONTENT_FIELD_SET = new Set<string>(PROPOSAL_CONTENT_FIELDS);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
): MutationContractResult<string | null> {
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

function requiredText(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): MutationContractResult<string> {
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string.` };
  }
  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    return {
      ok: false,
      error: `${field} must contain ${minLength}-${maxLength} characters.`,
    };
  }
  return { ok: true, data: normalized };
}

function optionalDate(value: unknown, field: string): MutationContractResult<string | null> {
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

function optionalUuid(value: unknown, field: string): MutationContractResult<string | null> {
  if (value === null || value === "") return { ok: true, data: null };
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return { ok: false, error: `${field} must be a UUID or null.` };
  }
  return { ok: true, data: value };
}

function proposalIds(value: unknown): MutationContractResult<string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: "informed_by_proposals must be an array of UUIDs." };
  }
  if (value.length > 100) {
    return { ok: false, error: "informed_by_proposals cannot contain more than 100 items." };
  }
  if (value.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    return { ok: false, error: "informed_by_proposals must contain only UUIDs." };
  }
  return { ok: true, data: Array.from(new Set(value as string[])) };
}

function sdgAlignments(value: unknown): MutationContractResult<ProposalSdgAlignmentInput[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: "sdg_alignments must be an array." };
  }
  if (value.length > 17) {
    return { ok: false, error: "sdg_alignments cannot contain more than 17 items." };
  }

  const output: ProposalSdgAlignmentInput[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    if (!isRecord(item)) {
      return { ok: false, error: "Each SDG alignment must be an object." };
    }
    const unknown = Object.keys(item).filter((key) => !["sdg_number", "indicator"].includes(key));
    if (unknown.length > 0) {
      return { ok: false, error: `Unexpected SDG alignment field(s): ${unknown.join(", ")}.` };
    }
    if (!Number.isInteger(item.sdg_number) || (item.sdg_number as number) < 1 || (item.sdg_number as number) > 17) {
      return { ok: false, error: "sdg_number must be an integer from 1 to 17." };
    }
    const sdgNumber = item.sdg_number as number;
    if (seen.has(sdgNumber)) {
      return { ok: false, error: `SDG ${sdgNumber} is duplicated.` };
    }
    const indicator = normalizedOptionalText(item.indicator ?? null, "indicator", 2_000);
    if (!indicator.ok) return indicator;
    seen.add(sdgNumber);
    output.push({ sdg_number: sdgNumber, indicator: indicator.data });
  }
  return { ok: true, data: output };
}

function parseProposalContent(
  input: unknown,
  mode: "create" | "update",
): MutationContractResult<ProposalContentInput> {
  if (!isRecord(input)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const unknownFields = Object.keys(input).filter((field) => !CONTENT_FIELD_SET.has(field));
  if (unknownFields.length > 0) {
    return { ok: false, error: `Unexpected or protected field(s): ${unknownFields.join(", ")}.` };
  }

  const output: ProposalContentInput = {};

  if (mode === "create" || Object.hasOwn(input, "title")) {
    const title = requiredText(input.title, "title", 3, 300);
    if (!title.ok) return title;
    output.title = title.data;
  }
  if (mode === "create" || Object.hasOwn(input, "rationale")) {
    const rationale = requiredText(input.rationale, "rationale", 10, 20_000);
    if (!rationale.ok) return rationale;
    output.rationale = rationale.data;
  }

  const textFields = [
    ["objectives", 20_000],
    ["target_beneficiaries", 5_000],
    ["expected_output", 10_000],
  ] as const;
  for (const [field, maxLength] of textFields) {
    if (!Object.hasOwn(input, field)) continue;
    const parsed = normalizedOptionalText(input[field], field, maxLength);
    if (!parsed.ok) return parsed;
    output[field] = parsed.data;
  }

  for (const field of ["timeline_start", "timeline_end"] as const) {
    if (!Object.hasOwn(input, field)) continue;
    const parsed = optionalDate(input[field], field);
    if (!parsed.ok) return parsed;
    output[field] = parsed.data;
  }

  if (output.timeline_start && output.timeline_end && output.timeline_end < output.timeline_start) {
    return { ok: false, error: "timeline_end cannot be before timeline_start." };
  }

  if (Object.hasOwn(input, "budget")) {
    const budget = input.budget;
    if (budget !== null && (typeof budget !== "number" || !Number.isFinite(budget) || budget < 0)) {
      return { ok: false, error: "budget must be a non-negative number or null." };
    }
    output.budget = budget as number | null;
  }

  if (Object.hasOwn(input, "expected_beneficiary_count")) {
    const count = input.expected_beneficiary_count;
    if (count !== null && (!Number.isInteger(count) || (count as number) < 0)) {
      return { ok: false, error: "expected_beneficiary_count must be a non-negative integer or null." };
    }
    output.expected_beneficiary_count = count as number | null;
  }

  if (Object.hasOwn(input, "barangay_id")) {
    const barangayId = optionalUuid(input.barangay_id, "barangay_id");
    if (!barangayId.ok) return barangayId;
    output.barangay_id = barangayId.data;
  }

  if (Object.hasOwn(input, "is_income_generating")) {
    if (typeof input.is_income_generating !== "boolean") {
      return { ok: false, error: "is_income_generating must be a boolean." };
    }
    output.is_income_generating = input.is_income_generating;
  }

  if (Object.hasOwn(input, "informed_by_proposals")) {
    const informedBy = proposalIds(input.informed_by_proposals);
    if (!informedBy.ok) return informedBy;
    output.informed_by_proposals = informedBy.data;
  }

  if (Object.hasOwn(input, "sdg_alignments")) {
    const alignments = sdgAlignments(input.sdg_alignments);
    if (!alignments.ok) return alignments;
    output.sdg_alignments = alignments.data;
  }

  if (mode === "update" && Object.keys(output).length === 0) {
    return { ok: false, error: "At least one proposal content field is required." };
  }

  return { ok: true, data: output };
}

export function parseProposalCreateInput(input: unknown): MutationContractResult<ProposalContentInput> {
  return parseProposalContent(input, "create");
}

export function parseProposalUpdateInput(input: unknown): MutationContractResult<ProposalContentInput> {
  return parseProposalContent(input, "update");
}
