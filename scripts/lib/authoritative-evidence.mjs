import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectSchemaOnlyDump, readLedgerVersions } from "./migration-governance.mjs";

export const REQUIRED_AUTHORITATIVE_CATALOGS = Object.freeze([
  "tables-columns.json",
  "constraints-indexes.json",
  "extensions.json",
  "functions.json",
  "triggers.json",
  "rls-policies.json",
  "grants-default-privileges.json",
  "storage-buckets-policies.json",
]);

const SECRET_LIKE = /(?:postgres(?:ql)?:\/\/[^\s"']+|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b|(?:service_role|database_url|db_password)\s*[:=])/i;

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
  } catch {
    problems.push(`${name} is not valid JSON`);
  }
  return problems;
}

export async function validateAuthoritativeEvidence({ schemaPath, ledgerPath, catalogDirectory }) {
  const schema = await readFile(resolve(schemaPath), "utf8");
  const problems = inspectSchemaOnlyDump(schema);
  if (containsCredentialLikeMaterial(schema)) problems.push("schema capture contains credential-like material");

  const ledgerSource = await readFile(resolve(ledgerPath));
  const ledger = await readLedgerVersions(resolve(ledgerPath));
  const catalogs = [];

  for (const name of REQUIRED_AUTHORITATIVE_CATALOGS) {
    const path = resolve(catalogDirectory, name);
    const metadata = await stat(path).catch(() => null);
    if (!metadata?.isFile()) {
      problems.push(`${name} is missing`);
      continue;
    }
    const source = await readFile(path);
    problems.push(...validateCatalogJson(source, name));
    catalogs.push({ name, bytes: source.length, sha256: sha256Buffer(source) });
  }

  return {
    valid: problems.length === 0,
    schema: { bytes: Buffer.byteLength(schema), sha256: sha256Buffer(schema) },
    ledger: { versions: ledger.length, sha256: sha256Buffer(ledgerSource) },
    catalogs,
    problems,
  };
}
