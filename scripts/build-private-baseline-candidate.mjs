import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { inspectSchemaOnlyDump } from "./lib/migration-governance.mjs";
import { splitSqlStatements } from "./lib/sanitized-catalog-capture.mjs";
import { validateAuthoritativeCapture } from "./lib/authoritative-evidence.mjs";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function outsideRepository(repository, candidate) {
  const value = relative(repository, candidate);
  return value.startsWith("..") && !value.startsWith(`..${sep}..${sep}`);
}
function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) options[argv[index]] = argv[index + 1];
  for (const name of ["--capture-dir", "--extension-schema", "--storage-schema", "--candidate-output", "--configuration-output"]) {
    if (!options[name]) throw new Error(`${name} is required`);
  }
  return options;
}
function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'`; }

try {
  const options = parse(process.argv.slice(2));
  const repository = resolve(import.meta.dirname, "..");
  const capture = resolve(options["--capture-dir"]);
  const candidateOutput = resolve(options["--candidate-output"]);
  const configurationOutput = resolve(options["--configuration-output"]);
  if (![capture, candidateOutput, configurationOutput].every((path) => outsideRepository(repository, path))) {
    throw new Error("capture and candidate outputs must remain outside the repository");
  }
  const validation = await validateAuthoritativeCapture({ captureDirectory: capture });
  if (!validation.valid || validation.metadata.timestampedMigrationsApplied || validation.ledger.versions !== 0) {
    throw new Error("Branch 1 candidate requires a validated authoritative capture with an explicitly empty ledger");
  }
  const [publicSchema, extensionSchema, storageSchema, bucketCatalogSource] = await Promise.all([
    readFile(resolve(capture, "schema", "public-schema.sql"), "utf8"),
    readFile(resolve(options["--extension-schema"]), "utf8"),
    readFile(resolve(options["--storage-schema"]), "utf8"),
    readFile(resolve(capture, "storage", "buckets.json"), "utf8"),
  ]);
  const extensions = splitSqlStatements(extensionSchema).filter((statement) => /^\s*CREATE EXTENSION\b/i.test(statement));
  const storagePolicies = splitSqlStatements(storageSchema).filter((statement) => /^\s*CREATE POLICY\b[\s\S]*?\bON\s+"?storage"?\./i.test(statement));
  if (!extensions.length) throw new Error("no extension declarations were found");
  const candidate = [
    "-- AGAPE private pre-Phase-0 baseline candidate; not approved for deployment.",
    "-- Derived from validated authoritative schema-only capture.",
    ...extensions,
    publicSchema.trim(),
    ...storagePolicies,
    "",
  ].join("\n\n");
  const problems = inspectSchemaOnlyDump(candidate);
  if (problems.length) throw new Error(`candidate is not schema-only: ${problems.join("; ")}`);

  const bucketCatalog = JSON.parse(bucketCatalogSource);
  const buckets = Array.isArray(bucketCatalog.objects) ? bucketCatalog.objects : [];
  const configuration = [
    "-- Private reconciliation-only Storage configuration; never promoted into the schema-only baseline.",
    ...buckets.map((bucket) => {
      const mime = Array.isArray(bucket.allowedMimeTypes) && bucket.allowedMimeTypes.length
        ? `ARRAY[${bucket.allowedMimeTypes.map(sqlLiteral).join(",")}]::text[]` : "NULL";
      const limit = Number.isSafeInteger(bucket.fileSizeLimit) ? String(bucket.fileSizeLimit) : "NULL";
      return `INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES (${sqlLiteral(bucket.name)},${sqlLiteral(bucket.name)},${bucket.public === true},${limit},${mime}) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;`;
    }),
    "",
  ].join("\n");
  await mkdir(dirname(candidateOutput), { recursive: true });
  await mkdir(dirname(configurationOutput), { recursive: true });
  await writeFile(candidateOutput, candidate, "utf8");
  await writeFile(configurationOutput, configuration, "utf8");
  console.log(JSON.stringify({
    captureId: validation.captureId,
    candidateBytes: Buffer.byteLength(candidate), candidateSha256: sha256(candidate),
    extensions: extensions.length, storagePolicies: storagePolicies.length,
    configurationRows: buckets.length, configurationSha256: sha256(configuration),
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
