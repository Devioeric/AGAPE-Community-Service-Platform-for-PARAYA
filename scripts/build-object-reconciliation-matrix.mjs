import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { REQUIRED_CAPTURE_FILES, validateAuthoritativeCapture } from "./lib/authoritative-evidence.mjs";
import { classifyMigrationName } from "./lib/migration-governance.mjs";
import { extractPublicCatalog, extractStoragePolicies } from "./lib/sanitized-catalog-capture.mjs";

const CATALOG_FILES = REQUIRED_CAPTURE_FILES.filter((name) => name.startsWith("catalog/") || name.startsWith("storage/"));
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function definitionHash(item) { return item.definitionSha256 ?? hash(JSON.stringify(canonical(item))); }
function outsideRepository(repository, candidate) {
  const value = relative(repository, candidate);
  return value.startsWith("..") && !value.startsWith(`..${sep}..${sep}`);
}
function args(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) parsed[argv[index]] = argv[index + 1];
  for (const key of ["--authoritative-capture", "--migration-dir", "--output"]) if (!parsed[key]) throw new Error(`${key} is required`);
  return parsed;
}
function add(map, item, file) {
  const existing = map.get(item.stableIdentifier) ?? [];
  existing.push({ file, definitionHash: definitionHash(item), objectType: item.objectType ?? "unknown", tableName: item.tableName ?? null });
  map.set(item.stableIdentifier, existing);
}

try {
  const options = args(process.argv.slice(2));
  const repository = resolve(import.meta.dirname, "..");
  const capture = resolve(options["--authoritative-capture"]);
  const migrationDirectory = resolve(options["--migration-dir"]);
  const output = resolve(options["--output"]);
  if (!outsideRepository(repository, capture) || !outsideRepository(repository, output)) throw new Error("capture and matrix output must remain outside the repository");
  const validation = await validateAuthoritativeCapture({ captureDirectory: capture });
  if (!validation.valid) throw new Error("authoritative capture failed validation");
  if (validation.metadata.timestampedMigrationsApplied || validation.ledger.versions !== 0) throw new Error("this Branch 1 matrix requires an explicitly empty authoritative ledger");

  const authoritative = new Map();
  for (const file of CATALOG_FILES) {
    const parsed = JSON.parse(await readFile(resolve(capture, ...file.split("/")), "utf8"));
    for (const item of parsed.objects ?? parsed.items ?? (Array.isArray(parsed) ? parsed : [])) {
      authoritative.set(item.stableIdentifier, { file, definitionHash: definitionHash(item), objectType: item.objectType ?? basename(file, ".json"), tableName: item.tableName ?? null });
    }
  }

  const repositoryObjects = new Map();
  const names = (await readdir(migrationDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql") && !classifyMigrationName(entry.name).version)
    .map((entry) => entry.name).sort();
  for (const name of names) {
    const source = await readFile(resolve(migrationDirectory, name), "utf8");
    const catalog = extractPublicCatalog(source, source);
    for (const items of Object.values(catalog)) for (const item of items) add(repositoryObjects, item, name);
    for (const item of extractStoragePolicies(source)) add(repositoryObjects, item, name);
  }

  const identifiers = [...new Set([...authoritative.keys(), ...repositoryObjects.keys()])].sort();
  const rows = identifiers.map((stableObjectId) => {
    const live = authoritative.get(stableObjectId);
    const sources = repositoryObjects.get(stableObjectId) ?? [];
    const hashes = [...new Set(sources.map((item) => item.definitionHash))];
    const files = [...new Set(sources.map((item) => item.file))].sort();
    let classification;
    if (!live) classification = hashes.length > 1 ? "Order unknown" : "Repository only";
    else if (!sources.length) classification = "Live only";
    else if (hashes.length > 1) classification = "Order unknown";
    else if (hashes[0] === live.definitionHash) classification = files.length > 1 ? "Superseded" : "Matched";
    else classification = "Definition drift";
    const securityObject = /policy|rls|grant|function|trigger/i.test(`${stableObjectId} ${live?.objectType ?? sources[0]?.objectType ?? ""}`);
    const liveStorageBucket = stableObjectId.startsWith("storage.bucket.");
    return {
      stableObjectId,
      objectType: live?.objectType ?? sources[0]?.objectType ?? "unknown",
      authoritativeDefinitionHash: live?.definitionHash ?? null,
      repositoryDefinitionHashes: hashes,
      originatingLegacyFiles: files,
      ledgerEvidence: { captureId: validation.captureId, timestampedVersionsApplied: 0, branch: "no-timestamped-migrations-applied" },
      classification,
      applicationDependencies: live?.tableName ? [`public.${live.tableName}`] : [],
      rlsSecurityEffect: securityObject ? "Security-sensitive; preserve the exact authoritative definition in the baseline and verify after replay" : "Schema/equivalence impact",
      baselineDisposition: live
        ? liveStorageBucket ? "Represent as AGAPE-owned Storage configuration; do not copy Storage base tables" : "Include exact authoritative definition in the Branch 1 pre-Phase-0 baseline"
        : "Exclude from the pre-Phase-0 baseline; retain source only in the non-executable legacy archive",
      requiredForwardCorrection: live ? null : "None at baseline; apply only through the reviewed timestamped target chain",
      verificationQuery: "Re-capture this stable object and compare its sanitized definition hash after disposable replay",
      rollbackBehavior: "Forward-only correction; never weaken RLS, grants, or audit immutability",
    };
  });
  const counts = rows.reduce((result, row) => ({ ...result, [row.classification]: (result[row.classification] ?? 0) + 1 }), {});
  const report = {
    schema: "agape.reconciliation-matrix.v1", captureId: validation.captureId,
    branch: "no-timestamped-migrations-applied", baselineSource: "validated-authoritative-staging-schema",
    postgresMajor: validation.metadata.postgresMajor, ledgerVersions: 0,
    rows, counts, needsConfirmation: 0,
    matrixSha256: hash(JSON.stringify(canonical(rows))),
  };
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ captureId: report.captureId, branch: report.branch, objects: rows.length, counts, needsConfirmation: 0, matrixSha256: report.matrixSha256 }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
