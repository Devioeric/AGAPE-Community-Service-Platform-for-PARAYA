import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import {
  PROFILING_MAX_IMPORT_ROWS,
  PROFILING_MAX_UPLOAD_BYTES,
  PROFILING_TEMPLATE_VERSION,
  HOUSEHOLD_IMPORT_FIELDS,
  RESIDENT_IMPORT_FIELDS,
  findProhibitedProfileKeys,
  parseProfilingPackage,
} from "@/lib/profiling/contracts";
import { normalizeProfilingImportHeader, validateProfilingImportHeaders } from "@/lib/profiling/import-headers";

export type ImportRowError = { sheet: "Households" | "Residents"; row: number; field?: string; message: string; fatal: boolean };
export type ParsedProfilingImport = {
  fileHash: string;
  templateVersion: string;
  households: Record<string, unknown>[];
  residents: Record<string, unknown>[];
  errors: ImportRowError[];
  totalRows: number;
};

export type StagedProfilingPackage = { row_number: number; row_key: string; payload: Record<string, unknown> };

const HOUSEHOLD_REQUIRED = ["household_row_key", "sample_reference", "sitio_id", "participation_consent", "household_consent_name", "privacy_notice_version"];
const RESIDENT_REQUIRED = ["household_row_key", "first_name", "last_name", "consent_status"];

function normalizeHeader(value: string): string {
  return normalizeProfilingImportHeader(value);
}

function normalizeRow(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [normalizeHeader(key), value]));
}

function validateRows(sheet: "Households" | "Residents", rows: Record<string, unknown>[], required: string[]): ImportRowError[] {
  const errors: ImportRowError[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    for (const key of required) {
      if (row[key] === undefined || row[key] === null || String(row[key]).trim() === "") {
        errors.push({ sheet, row: rowNumber, field: key, message: `${key} is required`, fatal: true });
      }
    }
    for (const key of findProhibitedProfileKeys(row)) {
      errors.push({ sheet, row: rowNumber, field: key, message: "Prohibited profiling column", fatal: true });
    }
  });
  return errors;
}

function validateHeaders(sheet: XLSX.WorkSheet, sheetName: "Households" | "Residents", allowed: readonly string[]): ImportRowError[] {
  const firstRow = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false })[0] ?? [];
  return validateProfilingImportHeaders(firstRow, allowed).map((issue) => ({ sheet: sheetName, row: 1, field: issue.field, message: issue.message, fatal: true }));
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: "Households" | "Residents", allowed: readonly string[]): { rows: Record<string, unknown>[]; errors: ImportRowError[] } {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Required sheet is missing: ${sheetName}`);
  return {
    rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false }).map(normalizeRow),
    errors: validateHeaders(sheet, sheetName, allowed),
  };
}

export function parseProfilingWorkbook(bytes: Uint8Array): ParsedProfilingImport {
  if (bytes.byteLength === 0) throw new Error("Workbook is empty");
  if (bytes.byteLength > PROFILING_MAX_UPLOAD_BYTES) throw new Error("Workbook exceeds the 10 MB limit");

  const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
  const householdSheet = sheetRows(workbook, "Households", HOUSEHOLD_IMPORT_FIELDS);
  const residentSheet = sheetRows(workbook, "Residents", RESIDENT_IMPORT_FIELDS);
  const households = householdSheet.rows;
  const residents = residentSheet.rows;
  const totalRows = households.length + residents.length;
  if (totalRows > PROFILING_MAX_IMPORT_ROWS) throw new Error("Workbook exceeds the 10,000-row limit");

  const metadata = workbook.Sheets.Metadata;
  const metadataRows = metadata ? XLSX.utils.sheet_to_json<Record<string, unknown>>(metadata, { defval: null }) : [];
  const version = String(metadataRows[0]?.template_version ?? "").trim();
  const errors: ImportRowError[] = [...householdSheet.errors, ...residentSheet.errors];
  if (version !== PROFILING_TEMPLATE_VERSION) {
    errors.push({ sheet: "Households", row: 1, field: "template_version", message: `Expected template ${PROFILING_TEMPLATE_VERSION}`, fatal: true });
  }
  errors.push(...validateRows("Households", households, HOUSEHOLD_REQUIRED));
  errors.push(...validateRows("Residents", residents, RESIDENT_REQUIRED));

  const householdKeys = new Set(households.map((row) => String(row.household_row_key ?? "").trim()));
  residents.forEach((row, index) => {
    if (!householdKeys.has(String(row.household_row_key ?? "").trim())) {
      errors.push({ sheet: "Residents", row: index + 2, field: "household_row_key", message: "Resident references a household not present in this import", fatal: true });
    }
  });

  return {
    fileHash: createHash("sha256").update(bytes).digest("hex"),
    templateVersion: version,
    households,
    residents,
    errors,
    totalRows,
  };
}

export function parsePairedProfilingCsv(householdBytes: Uint8Array, residentBytes: Uint8Array): ParsedProfilingImport {
  if (householdBytes.byteLength + residentBytes.byteLength > PROFILING_MAX_UPLOAD_BYTES) throw new Error("CSV files exceed the combined 10 MB limit");
  const householdBook = XLSX.read(householdBytes, { type: "array" });
  const residentBook = XLSX.read(residentBytes, { type: "array" });
  const householdSheet = householdBook.Sheets[householdBook.SheetNames[0]!]!;
  const residentSheet = residentBook.Sheets[residentBook.SheetNames[0]!]!;
  const households = XLSX.utils.sheet_to_json<Record<string, unknown>>(householdSheet, { defval: null, raw: false }).map(normalizeRow);
  const residents = XLSX.utils.sheet_to_json<Record<string, unknown>>(residentSheet, { defval: null, raw: false }).map(normalizeRow);
  const totalRows = households.length + residents.length;
  if (totalRows > PROFILING_MAX_IMPORT_ROWS) throw new Error("CSV files exceed the 10,000-row limit");
  const errors = [
    ...validateHeaders(householdSheet, "Households", HOUSEHOLD_IMPORT_FIELDS),
    ...validateHeaders(residentSheet, "Residents", RESIDENT_IMPORT_FIELDS),
    ...validateRows("Households", households, [...HOUSEHOLD_REQUIRED, "template_version"]),
    ...validateRows("Residents", residents, RESIDENT_REQUIRED),
  ];
  households.forEach((row, index) => {
    if (String(row.template_version ?? "").trim() !== PROFILING_TEMPLATE_VERSION) errors.push({ sheet: "Households", row: index + 2, field: "template_version", message: `Expected template ${PROFILING_TEMPLATE_VERSION}`, fatal: true });
  });
  const householdKeys = new Set(households.map((row) => String(row.household_row_key ?? "").trim()));
  residents.forEach((row, index) => {
    if (!householdKeys.has(String(row.household_row_key ?? "").trim())) errors.push({ sheet: "Residents", row: index + 2, field: "household_row_key", message: "Resident references a household not present in this import", fatal: true });
  });
  return {
    fileHash: createHash("sha256").update(householdBytes).update(residentBytes).digest("hex"),
    templateVersion: PROFILING_TEMPLATE_VERSION,
    households, residents, errors, totalRows,
  };
}

function list(value: unknown): string[] {
  if (value == null || String(value).trim() === "") return [];
  return String(value).split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function bool(value: unknown): boolean | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["yes", "true", "1"].includes(normalized)) return true;
  if (["no", "false", "0"].includes(normalized)) return false;
  return null;
}

function integer(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function buildStagedProfilingPackages(parsed: ParsedProfilingImport, cycleId: string, asOfDate?: string): { packages: StagedProfilingPackage[]; errors: ImportRowError[] } {
  const errors = [...parsed.errors];
  const byHousehold = new Map<string, Record<string, unknown>[]>();
  parsed.residents.forEach((resident) => {
    const key = String(resident.household_row_key ?? "").trim();
    byHousehold.set(key, [...(byHousehold.get(key) ?? []), resident]);
  });

  const packages: StagedProfilingPackage[] = [];
  parsed.households.forEach((household, index) => {
    const key = String(household.household_row_key ?? "").trim();
    const residentPayloads = (byHousehold.get(key) ?? []).map((resident) => ({
      ...(resident.resident_id && String(resident.resident_id).trim() ? { resident_id: String(resident.resident_id).trim() } : {}),
      household_row_key: key,
      first_name: resident.first_name,
      middle_name: resident.middle_name || null,
      last_name: resident.last_name,
      suffix: resident.suffix || null,
      birth_date: resident.birth_date || null,
      estimated_age: integer(resident.estimated_age),
      sex: resident.sex || "not_stated",
      civil_status: resident.civil_status || "not_stated",
      relationship_to_head: resident.relationship_to_head || null,
      education_level: resident.education_level || null,
      is_enrolled: bool(resident.is_enrolled),
      school_category: resident.school_category || "not_stated",
      employment_status: resident.employment_status || "not_stated",
      occupation_category: resident.occupation_category || null,
      income_bracket: resident.income_bracket || "not_stated",
      skills: list(resident.skills),
      disability_support: list(resident.disability_support),
      health_support: list(resident.health_support),
      pregnancy_status: bool(resident.pregnancy_status),
      pregnancy_effective_from: resident.pregnancy_effective_from || null,
      pregnancy_effective_to: resident.pregnancy_effective_to || null,
      is_solo_parent: bool(resident.is_solo_parent),
      is_4ps_member: bool(resident.is_4ps_member),
      planning_needs: list(resident.planning_needs),
      consent_status: String(resident.consent_status ?? "").toLowerCase(),
      guardian_name: resident.guardian_name || null,
      guardian_relationship: resident.guardian_relationship || null,
    }));
    const payload = {
      cycle_id: cycleId,
      household_row_key: key,
      participation_consent: String(household.participation_consent ?? "").toLowerCase(),
      household_consent_name: household.household_consent_name,
      privacy_notice_version: household.privacy_notice_version,
      sample_reference: household.sample_reference || null,
      expected_version: 0,
      household: {
        sitio_id: household.sitio_id,
        landmark: household.landmark || null,
        contact_number: household.contact_number || null,
        income_bracket: household.income_bracket || "not_stated",
        housing_condition: household.housing_condition || "not_stated",
        electricity: household.electricity || "not_stated",
        water_source: household.water_source || "not_stated",
        sanitation: household.sanitation || "not_stated",
        internet_access: household.internet_access || "not_stated",
        devices: list(household.devices), hazards: list(household.hazards), needs: list(household.needs),
        anonymous_nonparticipant_count: integer(household.anonymous_nonparticipant_count) ?? 0,
      },
      residents: residentPayloads,
    };
    const result = parseProfilingPackage(payload, asOfDate);
    if (!result.success) errors.push({ sheet: "Households", row: index + 2, message: result.error, fatal: true });
    else packages.push({ row_number: index + 2, row_key: key, payload: result.data });
  });
  return { packages, errors };
}
