import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { historicalProgramCreateSchema } from "./contracts";

export const HISTORICAL_TEMPLATE_VERSION = "agape.historical-programs.v2.1";
export const HISTORICAL_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const HISTORICAL_MAX_ROWS = 10_000;
export const HISTORICAL_PROGRAM_HEADERS = ["reference", "title", "summary", "category", "date_precision", "starts_on", "ends_on", "beneficiary_count", "volunteer_count", "volunteer_hours", "budget_total", "resources", "historical_need_description", "outcomes", "follow_up", "source_type", "source_notes", "partner_codes", "barangay_codes"] as const;
export const HISTORICAL_SDG_HEADERS = ["program_reference", "sdg_number", "classification_source"] as const;
export const HISTORICAL_NEED_HEADERS = ["program_reference", "need_id"] as const;
const PROHIBITED = /(^|_)(resident|beneficiary_name|volunteer_name|government_id|national_id|diagnosis|medical|password|biometric|photo|gps|latitude|longitude)(_|$)/i;

type Row = Record<string, unknown>;
export type HistoricalStagedRow = { rowKey: string; data: Record<string, unknown> | null; errors: string[] };

function normalizedRows(sheet: XLSX.WorkSheet | undefined, requiredHeaders: readonly string[]): Row[] {
  if (!sheet) throw new Error("Required Programs sheet is missing");
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
  const headers = Object.keys(XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, defval: "" })[0] ?? {}).length;
  void headers;
  const actual = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })[0] ?? []).map((value) => String(value).replace(/^\uFEFF/, "").trim().toLowerCase());
  if (actual.some((header) => !header)) throw new Error("Import headers cannot be blank");
  if (new Set(actual).size !== actual.length) throw new Error("Duplicate import header after normalization");
  for (const header of actual) if (PROHIBITED.test(header)) throw new Error(`Prohibited import column: ${header}`);
  for (const header of requiredHeaders) if (!actual.includes(header)) throw new Error(`Missing required column: ${header}`);
  for (const header of actual) if (!requiredHeaders.includes(header)) throw new Error(`Unknown import column: ${header}`);
  return rows;
}

const nullableDate = (value: unknown) => String(value ?? "").trim() || null;
const nullableNumber = (value: unknown) => String(value ?? "").trim() === "" ? null : Number(value);
const decimal = (value: unknown) => String(value ?? "").trim() || null;
const codes = (value: unknown) => String(value ?? "").split(/[;,]/).map((item) => item.trim()).filter(Boolean);

export function parseHistoricalWorkbook(bytes: Uint8Array): { fileHash: string; rows: HistoricalStagedRow[]; totalRows: number } {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
  const instructionRows = workbook.Sheets.Instructions ? XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Instructions, { header: 1, defval: "" }) : [];
  if (String(instructionRows[0]?.[1] ?? "") !== HISTORICAL_TEMPLATE_VERSION) throw new Error("Unsupported or missing template version");
  const programs = normalizedRows(workbook.Sheets.Programs, HISTORICAL_PROGRAM_HEADERS);
  const sdgRows = workbook.Sheets.SDGs ? normalizedRows(workbook.Sheets.SDGs, HISTORICAL_SDG_HEADERS) : [];
  const needRows = workbook.Sheets.Needs ? normalizedRows(workbook.Sheets.Needs, HISTORICAL_NEED_HEADERS) : [];
  if (programs.length + sdgRows.length + needRows.length > HISTORICAL_MAX_ROWS) throw new Error("Import exceeds 10,000 combined rows");
  const sdgsByReference = new Map<string, Array<{ number: number; source: string }>>();
  for (const row of sdgRows) {
    const reference = String(row.program_reference ?? "").trim();
    const list = sdgsByReference.get(reference) ?? [];
    list.push({ number: Number(row.sdg_number), source: String(row.classification_source ?? "") });
    sdgsByReference.set(reference, list);
  }
  const needsByReference = new Map<string, string[]>();
  for (const row of needRows) {
    const reference = String(row.program_reference ?? "").trim();
    const needId = String(row.need_id ?? "").trim();
    const list = needsByReference.get(reference) ?? [];
    list.push(needId);
    needsByReference.set(reference, list);
  }
  const seen = new Set<string>();
  const rows = programs.map((row, index): HistoricalStagedRow => {
    const rowKey = String(row.reference ?? "").trim();
    const errors: string[] = [];
    if (!rowKey || rowKey.length > 80 || !/^[A-Za-z0-9._-]+$/.test(rowKey)) errors.push("reference must be an opaque 1-80 character code");
    if (seen.has(rowKey)) errors.push("duplicate workbook reference");
    seen.add(rowKey);
    const candidate = {
      title: String(row.title ?? "").trim(), summary: String(row.summary ?? "").trim() || null, category: String(row.category ?? "").trim(),
      datePrecision: String(row.date_precision ?? ""), startsOn: nullableDate(row.starts_on), endsOn: nullableDate(row.ends_on),
      beneficiaryCount: nullableNumber(row.beneficiary_count), volunteerCount: nullableNumber(row.volunteer_count),
      volunteerHours: decimal(row.volunteer_hours), budgetTotal: decimal(row.budget_total), currency: "PHP" as const,
      resources: String(row.resources ?? "").trim() || null, historicalNeedDescription: String(row.historical_need_description ?? "").trim() || null,
      outcomes: String(row.outcomes ?? "").trim() || null, followUp: String(row.follow_up ?? "").trim() || null,
      sourceType: String(row.source_type ?? ""), sourceNotes: String(row.source_notes ?? "").trim() || null,
      partnerIds: [], barangayIds: [], needIds: needsByReference.get(rowKey) ?? [],
      sdgs: (sdgsByReference.get(rowKey) ?? []).map((sdg) => ({ number: sdg.number, source: sdg.source })),
    };
    const parsed = historicalProgramCreateSchema.safeParse(candidate);
    if (!parsed.success) errors.push(...parsed.error.issues.map((issue) => `${issue.path.join(".") || `row ${index + 2}`}: ${issue.message}`));
    const data = parsed.success ? {
      title: parsed.data.title, summary: parsed.data.summary ?? null, category: parsed.data.category, date_precision: parsed.data.datePrecision,
      starts_on: parsed.data.startsOn, ends_on: parsed.data.endsOn ?? null, beneficiary_count: parsed.data.beneficiaryCount ?? null,
      volunteer_count: parsed.data.volunteerCount ?? null, volunteer_hours: parsed.data.volunteerHours ?? null, budget_total: parsed.data.budgetTotal ?? null,
      resources: parsed.data.resources ?? null, historical_need_description: parsed.data.historicalNeedDescription ?? null,
      outcomes: parsed.data.outcomes ?? null, follow_up: parsed.data.followUp ?? null,
      currency: "PHP", source_type: parsed.data.sourceType, source_notes: parsed.data.sourceNotes ?? null,
      partner_codes: codes(row.partner_codes), barangay_codes: codes(row.barangay_codes),
      need_ids: parsed.data.needIds,
      sdgs: parsed.data.sdgs.map((sdg) => ({ number: sdg.number, source: sdg.source })),
    } : null;
    return { rowKey: rowKey || `invalid-${index + 2}`, data, errors };
  });
  return { fileHash: createHash("sha256").update(bytes).digest("hex"), rows, totalRows: programs.length + sdgRows.length + needRows.length };
}

export function parseHistoricalCsv(programBytes: Uint8Array, sdgBytes?: Uint8Array, needBytes?: Uint8Array) {
  const programsBook = XLSX.read(programBytes, { type: "array", raw: false });
  const programsSheet = programsBook.Sheets[programsBook.SheetNames[0]];
  if (!programsSheet) throw new Error("Programs CSV is empty");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["template_version", HISTORICAL_TEMPLATE_VERSION]]), "Instructions");
  XLSX.utils.book_append_sheet(workbook, programsSheet, "Programs");
  if (sdgBytes) {
    const sdgBook = XLSX.read(sdgBytes, { type: "array", raw: false }); const sheet = sdgBook.Sheets[sdgBook.SheetNames[0]];
    if (sheet) XLSX.utils.book_append_sheet(workbook, sheet, "SDGs");
  }
  if (needBytes) {
    const needBook = XLSX.read(needBytes, { type: "array", raw: false }); const sheet = needBook.Sheets[needBook.SheetNames[0]];
    if (sheet) XLSX.utils.book_append_sheet(workbook, sheet, "Needs");
  }
  const normalizedBytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  const parsed = parseHistoricalWorkbook(normalizedBytes);
  const hash = createHash("sha256").update(programBytes).update("\0SDGS\0").update(sdgBytes ?? new Uint8Array())
    .update("\0NEEDS\0").update(needBytes ?? new Uint8Array()).digest("hex");
  return { ...parsed, fileHash: hash };
}

export function buildHistoricalTemplate(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([["template_version", HISTORICAL_TEMPLATE_VERSION], ["purpose", "Aggregate historical-program intake only; do not enter names or personal data."]]);
  const programs = XLSX.utils.aoa_to_sheet([[...HISTORICAL_PROGRAM_HEADERS]]);
  const sdgs = XLSX.utils.aoa_to_sheet([[...HISTORICAL_SDG_HEADERS]]);
  const needs = XLSX.utils.aoa_to_sheet([[...HISTORICAL_NEED_HEADERS]]);
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
  XLSX.utils.book_append_sheet(workbook, programs, "Programs");
  XLSX.utils.book_append_sheet(workbook, sdgs, "SDGs");
  XLSX.utils.book_append_sheet(workbook, needs, "Needs");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function buildHistoricalCsvTemplate(kind: "programs" | "sdgs" | "needs"): string {
  const headers = kind === "programs" ? HISTORICAL_PROGRAM_HEADERS : kind === "sdgs" ? HISTORICAL_SDG_HEADERS : HISTORICAL_NEED_HEADERS;
  return `${headers.join(",")}\r\n`;
}
