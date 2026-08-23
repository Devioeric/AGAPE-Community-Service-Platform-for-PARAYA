import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { inspectSchemaOnlyDump } from "./migration-governance.mjs";

export const AUTHORITATIVE_CAPTURE_SCHEMA = "agape.authoritative-capture.v1";
export const REQUIRED_CAPTURE_FILES = Object.freeze([
  "capture-metadata.json", "schema/public-schema.sql", "ledger/versions.txt",
  "ledger/catalog.json", "catalog/tables-columns.json",
  "catalog/constraints-indexes.json", "catalog/functions.json",
  "catalog/triggers.json", "catalog/rls-policies.json",
  "catalog/grants-default-privileges.json", "catalog/extensions.json",
  "storage/buckets.json", "storage/policies.json",
]);

// Transitional flat-capture contract retained for existing private bundles.
export const REQUIRED_AUTHORITATIVE_CATALOGS = Object.freeze([
  "tables-columns.json", "constraints-indexes.json", "extensions.json",
  "functions.json", "triggers.json", "rls-policies.json",
  "grants-default-privileges.json", "storage-buckets-policies.json",
]);

const SECRET_LIKE = /(?:postgres(?:ql)?:\/\/[^\s"']+|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b|(?:service_role|database_url|db_password|supabase_service_role_key)\s*[:=])/i;

export function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function containsCredentialLikeMaterial(value) {
  return SECRET_LIKE.test(Buffer.isBuffer(value) ? value.toString("utf8") : String(value));
}

export function validateCatalogJson(source, name) {
  const problems = [];
  if (source.length < 3) problems.push(`${name} is empty`);
  if (containsCredentialLikeMaterial(source)) problems.push(`${name} contains credential-like material`);
  try {
    const parsed = JSON.parse(source.toString("utf8"));
    if (parsed === null || typeof parsed !== "object") problems.push(`${name} must contain a JSON object or array`);
  } catch { problems.push(`${name} is not valid JSON`); }
  return problems;
}

function safeRelativePath(value) {
  const normalized = value.replaceAll("\\", "/");
  return normalized && !normalized.startsWith("/") && !normalized.includes("../") && !normalized.includes("\0");
}

export function parseManifest(source) {
  const entries = new Map();
  const problems = [];
  for (const [index, line] of source.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^([a-f0-9]{64})\s{2}(.+)$/.exec(line.trim());
    if (!match || !safeRelativePath(match?.[2] ?? "")) { problems.push(`manifest line ${index + 1} is malformed`); continue; }
    const path = match[2].replaceAll("\\", "/");
    if (entries.has(path)) problems.push(`manifest contains duplicate path ${path}`);
    entries.set(path, match[1]);
  }
  return { entries, problems };
}

export function parseCapturedLedger(source, timestampedMigrationsApplied) {
  const versions = [];
  const problems = [];
  for (const [index, line] of source.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    if (!/^\d{14}$/.test(value)) problems.push(`ledger line ${index + 1} is not a 14-digit version`);
    else versions.push(value);
  }
  if (new Set(versions).size !== versions.length) problems.push("ledger contains duplicate versions");
  if (versions.some((value, index) => index > 0 && value <= versions[index - 1])) problems.push("ledger versions are not strictly ordered");
  if (timestampedMigrationsApplied === true && versions.length === 0) problems.push("metadata says timestamped migrations were applied but ledger is empty");
  if (timestampedMigrationsApplied === false && versions.length > 0) problems.push("metadata says no timestamped migrations were applied but ledger is not empty");
  return { versions, problems };
}

export function validateCaptureMetadata(metadata) {
  const problems = [];
  if (metadata?.schema !== AUTHORITATIVE_CAPTURE_SCHEMA) problems.push("capture metadata schema is unsupported");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(metadata?.captureId ?? "")) problems.push("captureId is missing or malformed");
  if (!["staging", "production"].includes(metadata?.environment)) problems.push("capture environment must be staging or production");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(metadata?.projectReference ?? "")) problems.push("projectReference must be sanitized");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(metadata?.capturedAt ?? "")) problems.push("capturedAt must be an ISO UTC timestamp");
  if (!/^\S+(?:\s+\S+)+\s+\([^()]+\)$/.test(metadata?.operator ?? "")) problems.push("operator must be a named person and role");
  if (!Number.isInteger(metadata?.postgresMajor)) problems.push("postgresMajor must be an integer");
  if (typeof metadata?.supabaseCliVersion !== "string" || !metadata.supabaseCliVersion.trim()) problems.push("supabaseCliVersion is required");
  if (!Array.isArray(metadata?.schemaAllowlist) || !metadata.schemaAllowlist.includes("public")) problems.push("schemaAllowlist must include public");
  if (typeof metadata?.timestampedMigrationsApplied !== "boolean") problems.push("timestampedMigrationsApplied must be boolean");
  return problems;
}

async function readRequiredFile(captureDirectory, relativePath, problems) {
  const path = resolve(captureDirectory, ...relativePath.split("/"));
  const captureRoot = `${resolve(captureDirectory)}${sep}`.toLocaleLowerCase();
  if (!path.toLocaleLowerCase().startsWith(captureRoot)) throw new Error("capture path escaped its directory");
  const metadata = await stat(path).catch(() => null);
  if (!metadata?.isFile()) { problems.push(`${relativePath} is missing`); return null; }
  return readFile(path);
}

/** Validate an authorized sanitized capture without returning file contents. */
export async function validateAuthoritativeCapture({ captureDirectory, expectedPostgresMajor = 15 }) {
  const root = resolve(captureDirectory);
  const problems = [];
  const files = new Map();
  for (const name of [...REQUIRED_CAPTURE_FILES, "manifest.sha256"]) {
    const source = await readRequiredFile(root, name, problems);
    if (source) files.set(name, source);
  }
  if (problems.length) return { valid: false, captureId: null, files: [], ledger: { versions: 0, sha256: null }, problems };

  let metadata = null;
  try { metadata = JSON.parse(files.get("capture-metadata.json").toString("utf8")); }
  catch { problems.push("capture-metadata.json is not valid JSON"); }
  if (metadata) problems.push(...validateCaptureMetadata(metadata));
  if (metadata?.postgresMajor !== expectedPostgresMajor) problems.push(`PostgreSQL major must be ${expectedPostgresMajor}`);

  const manifest = parseManifest(files.get("manifest.sha256").toString("utf8"));
  problems.push(...manifest.problems);
  for (const name of REQUIRED_CAPTURE_FILES) {
    const expected = manifest.entries.get(name);
    const actual = sha256Buffer(files.get(name));
    if (!expected) problems.push(`manifest is missing ${name}`);
    else if (expected !== actual) problems.push(`manifest digest mismatch for ${name}`);
  }
  for (const name of manifest.entries.keys()) if (!REQUIRED_CAPTURE_FILES.includes(name)) problems.push(`manifest contains unexpected path ${name}`);

  const schema = files.get("schema/public-schema.sql").toString("utf8");
  problems.push(...inspectSchemaOnlyDump(schema));
  if (containsCredentialLikeMaterial(schema)) problems.push("schema capture contains credential-like material");
  const ledger = parseCapturedLedger(files.get("ledger/versions.txt").toString("utf8"), metadata?.timestampedMigrationsApplied);
  problems.push(...ledger.problems);

  for (const name of REQUIRED_CAPTURE_FILES.filter((name) => name.endsWith(".json"))) {
    const source = files.get(name);
    problems.push(...validateCatalogJson(source, name));
    if (name === "capture-metadata.json") continue;
    try {
      const parsed = JSON.parse(source.toString("utf8"));
      if (parsed && !Array.isArray(parsed) && parsed.captureId && parsed.captureId !== metadata?.captureId) problems.push(`${name} captureId does not match metadata`);
    } catch { /* malformed JSON already reported */ }
  }

  return {
    valid: problems.length === 0,
    captureId: metadata?.captureId ?? null,
    metadata: metadata ? {
      environment: metadata.environment, projectReference: metadata.projectReference,
      capturedAt: metadata.capturedAt, postgresMajor: metadata.postgresMajor,
      supabaseCliVersion: metadata.supabaseCliVersion,
      timestampedMigrationsApplied: metadata.timestampedMigrationsApplied,
    } : null,
    schema: { bytes: files.get("schema/public-schema.sql").length, sha256: sha256Buffer(files.get("schema/public-schema.sql")) },
    ledger: { versions: ledger.versions.length, sha256: sha256Buffer(files.get("ledger/versions.txt")) },
    files: REQUIRED_CAPTURE_FILES.map((name) => ({ name, bytes: files.get(name).length, sha256: sha256Buffer(files.get(name)) })),
    manifest: { sha256: sha256Buffer(files.get("manifest.sha256")), entries: manifest.entries.size },
    problems,
  };
}

export async function validateAuthoritativeEvidence({ schemaPath, ledgerPath, catalogDirectory }) {
  const schema = await readFile(resolve(schemaPath), "utf8");
  const problems = inspectSchemaOnlyDump(schema);
  if (containsCredentialLikeMaterial(schema)) problems.push("schema capture contains credential-like material");
  const ledgerSource = await readFile(resolve(ledgerPath));
  const ledger = parseCapturedLedger(ledgerSource.toString("utf8"), true);
  problems.push(...ledger.problems);
  const catalogs = [];
  for (const name of REQUIRED_AUTHORITATIVE_CATALOGS) {
    const path = resolve(catalogDirectory, name);
    const metadata = await stat(path).catch(() => null);
    if (!metadata?.isFile()) { problems.push(`${name} is missing`); continue; }
    const source = await readFile(path);
    problems.push(...validateCatalogJson(source, name));
    catalogs.push({ name, bytes: source.length, sha256: sha256Buffer(source) });
  }
  return { valid: problems.length === 0, schema: { bytes: Buffer.byteLength(schema), sha256: sha256Buffer(schema) }, ledger: { versions: ledger.versions.length, sha256: sha256Buffer(ledgerSource) }, catalogs, problems };
}

export function isOutsideRepository(repositoryRoot, candidatePath) {
  const value = relative(resolve(repositoryRoot), resolve(candidatePath));
  return value.startsWith("..") || value.includes(`..${sep}`);
}
