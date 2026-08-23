import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { REQUIRED_CAPTURE_FILES, sha256Buffer, validateAuthoritativeCapture } from "./authoritative-evidence.mjs";

export const CATALOG_EQUIVALENCE_SCHEMA = "agape.catalog-equivalence.v1";
const CATALOG_FILES = REQUIRED_CAPTURE_FILES.filter((name) => name.startsWith("catalog/") || name.startsWith("storage/"));

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

export function canonicalJsonHash(value) {
  return sha256Buffer(Buffer.from(JSON.stringify(canonicalize(value))));
}

function itemIdentifier(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return `item-${index + 1}`;
  for (const key of ["stableIdentifier", "objectId", "identity", "signature"]) {
    if (typeof item[key] === "string" && item[key].trim()) return item[key].trim();
  }
  const parts = [item.schema, item.objectType ?? item.type, item.tableName ?? item.table, item.policyName ?? item.name, item.columnName]
    .filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
  return parts.length ? parts.join(".") : `item-${index + 1}`;
}

function catalogItems(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.objects)) return parsed.objects;
  if (Array.isArray(parsed?.items)) return parsed.items;
  return [parsed];
}

async function captureObjects(captureDirectory) {
  const objects = new Map();
  const duplicates = [];
  for (const file of CATALOG_FILES) {
    const parsed = JSON.parse(await readFile(resolve(captureDirectory, ...file.split("/")), "utf8"));
    for (const [index, item] of catalogItems(parsed).entries()) {
      const stableIdentifier = `${file}:${itemIdentifier(item, index)}`;
      if (objects.has(stableIdentifier)) duplicates.push(stableIdentifier);
      objects.set(stableIdentifier, {
        stableIdentifier,
        objectType: basename(file, ".json"),
        definitionHash: canonicalJsonHash(item),
        captureFile: file,
      });
    }
  }
  return { objects, duplicates };
}

export async function compareCatalogCaptures({ authoritativeCapture, replayCapture }) {
  const [authoritativeValidation, replayValidation] = await Promise.all([
    validateAuthoritativeCapture({ captureDirectory: authoritativeCapture }),
    validateAuthoritativeCapture({ captureDirectory: replayCapture }),
  ]);
  const problems = [];
  if (!authoritativeValidation.valid) problems.push("authoritative capture failed validation");
  if (!replayValidation.valid) problems.push("replay capture failed validation");
  if (authoritativeValidation.metadata?.postgresMajor !== replayValidation.metadata?.postgresMajor) problems.push("PostgreSQL major versions differ");
  if (problems.length) return { schema: CATALOG_EQUIVALENCE_SCHEMA, equivalent: false, rows: [], problems };

  const [authoritative, replay] = await Promise.all([
    captureObjects(authoritativeCapture), captureObjects(replayCapture),
  ]);
  if (authoritative.duplicates.length) problems.push(`authoritative capture has ${authoritative.duplicates.length} duplicate stable identifiers`);
  if (replay.duplicates.length) problems.push(`replay capture has ${replay.duplicates.length} duplicate stable identifiers`);
  const identifiers = new Set([...authoritative.objects.keys(), ...replay.objects.keys()]);
  const rows = [...identifiers].sort().map((stableIdentifier) => {
    const live = authoritative.objects.get(stableIdentifier);
    const repository = replay.objects.get(stableIdentifier);
    const classification = !live ? "Repository only" : !repository ? "Live only"
      : live.definitionHash === repository.definitionHash ? "Matched" : "Definition drift";
    return {
      stableIdentifier,
      objectType: live?.objectType ?? repository?.objectType,
      authoritativeDefinitionHash: live?.definitionHash ?? null,
      repositoryDefinitionHash: repository?.definitionHash ?? null,
      originatingFiles: repository ? [repository.captureFile] : [],
      ledgerEvidence: {
        authoritativeCaptureId: authoritativeValidation.captureId,
        replayCaptureId: replayValidation.captureId,
      },
      classification,
      applicationDependencies: [],
      rlsSecurityEffect: classification === "Matched" ? "Matched catalog definition" : "Needs confirmation",
      baselineDisposition: classification === "Matched" ? "Represented" : "Needs confirmation",
      requiredForwardCorrection: classification === "Matched" ? null : "Needs confirmation after dependency/security review",
      verificationQuery: "Re-capture the same catalog object and rerun db:catalog-equivalence",
      rollbackBehavior: classification === "Matched" ? "No change" : "Forward-only correction; do not weaken security",
    };
  });
  const differences = rows.filter((row) => row.classification !== "Matched").length;
  return {
    schema: CATALOG_EQUIVALENCE_SCHEMA,
    equivalent: problems.length === 0 && differences === 0,
    authoritativeCaptureId: authoritativeValidation.captureId,
    replayCaptureId: replayValidation.captureId,
    rows,
    counts: { objects: rows.length, matched: rows.length - differences, differences },
    matrixDigest: canonicalJsonHash(rows),
    problems,
  };
}
