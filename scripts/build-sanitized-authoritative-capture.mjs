import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { REQUIRED_CAPTURE_FILES, containsCredentialLikeMaterial } from "./lib/authoritative-evidence.mjs";
import { extractPublicCatalog, extractStoragePolicies, sanitizeStorageBuckets } from "./lib/sanitized-catalog-capture.mjs";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function decodeText(value, label) {
  if (value[0] === 0xff && value[1] === 0xfe) return value.subarray(2).toString("utf16le");
  if (value[0] === 0xfe && value[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(value.length - 2);
    for (let index = 2; index + 1 < value.length; index += 2) {
      swapped[index - 2] = value[index + 1]; swapped[index - 1] = value[index];
    }
    return swapped.toString("utf16le");
  }
  const text = value.toString("utf8").replace(/^\uFEFF/, "");
  if (text.includes("\0")) throw new Error(`${label} has an unsupported text encoding`);
  return text;
}
function usage() {
  console.log("Usage: node scripts/build-sanitized-authoritative-capture.mjs --capture-dir <outside-git> --public-schema <sql> --storage-schema <sql> --extension-schema <sql> --storage-buckets <json> --ledger-raw <file> --capture-id <id> --project-reference <ref> --operator \"Name (Role)\" --captured-at <UTC>");
}
function parse(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`invalid option near ${key ?? "end"}`);
    result[key.slice(2)] = value;
  }
  for (const name of ["capture-dir", "public-schema", "storage-schema", "extension-schema", "storage-buckets", "ledger-raw", "capture-id", "project-reference", "operator", "captured-at"]) {
    if (!result[name]) throw new Error(`--${name} is required`);
  }
  return result;
}
function outsideRepository(repository, candidate) {
  const value = relative(repository, candidate);
  return value.startsWith("..") && !value.startsWith(`..${sep}..${sep}`);
}
async function jsonWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

try {
  const args = parse(process.argv.slice(2));
  const repository = resolve(import.meta.dirname, "..");
  const capture = resolve(args["capture-dir"]);
  if (!outsideRepository(repository, capture)) throw new Error("capture directory must be outside the repository");
  const inputs = await Promise.all([
    readFile(resolve(args["public-schema"])), readFile(resolve(args["storage-schema"])),
    readFile(resolve(args["extension-schema"])), readFile(resolve(args["storage-buckets"])),
    readFile(resolve(args["ledger-raw"])),
  ]);
  const [publicSchema, storageSchema, extensionSchema, bucketSource, ledgerRaw] = inputs.map((value, index) => decodeText(value, ["public schema", "Storage schema", "extension schema", "Storage buckets", "ledger"][index]));
  if ([publicSchema, storageSchema, extensionSchema, bucketSource, ledgerRaw].some(containsCredentialLikeMaterial)) {
    throw new Error("private input contains credential-like material");
  }
  const ledgerParsed = JSON.parse(ledgerRaw);
  const migrations = Array.isArray(ledgerParsed?.migrations) ? ledgerParsed.migrations : null;
  if (!migrations) throw new Error("ledger raw capture is not the expected JSON object");
  const versions = migrations.map((item) => String(item.version ?? item)).filter(Boolean).sort();
  if (versions.some((version) => !/^\d{14}$/.test(version))) throw new Error("ledger contains a malformed migration version");

  const catalog = extractPublicCatalog(publicSchema, extensionSchema);
  const storageBuckets = sanitizeStorageBuckets(JSON.parse(bucketSource));
  const captureId = args["capture-id"];
  const envelope = (objects, source) => ({ captureId, source, objects });
  const files = new Map([
    ["capture-metadata.json", {
      schema: "agape.authoritative-capture.v1", captureId, environment: "staging",
      projectReference: args["project-reference"], capturedAt: args["captured-at"], operator: args.operator,
      postgresMajor: 17, supabaseCliVersion: "2.114.0", schemaAllowlist: ["public"],
      timestampedMigrationsApplied: versions.length > 0,
    }],
    ["ledger/catalog.json", envelope(versions.map((version) => ({ stableIdentifier: `migration.${version}`, version })), "supabase-migration-list")],
    ["catalog/tables-columns.json", envelope(catalog.tablesColumns, "public-schema-only-dump")],
    ["catalog/constraints-indexes.json", envelope(catalog.constraintsIndexes, "public-schema-only-dump")],
    ["catalog/functions.json", envelope(catalog.functions, "public-schema-only-dump")],
    ["catalog/triggers.json", envelope(catalog.triggers, "public-schema-only-dump")],
    ["catalog/rls-policies.json", envelope(catalog.rlsPolicies, "public-schema-only-dump")],
    ["catalog/grants-default-privileges.json", envelope(catalog.grantsDefaultPrivileges, "public-schema-only-dump")],
    ["catalog/extensions.json", envelope(catalog.extensions, "full-schema-only-dump")],
    ["storage/buckets.json", envelope(storageBuckets, "storage-api-allowlist")],
    ["storage/policies.json", envelope(extractStoragePolicies(storageSchema), "storage-schema-only-dump")],
  ]);
  for (const [name, value] of files) await jsonWrite(resolve(capture, ...name.split("/")), value);
  await writeFile(resolve(capture, "ledger", "versions.txt"), versions.length ? `${versions.join("\n")}\n` : "", "utf8");

  const manifestLines = [];
  for (const name of REQUIRED_CAPTURE_FILES) {
    const source = await readFile(resolve(capture, ...name.split("/")));
    manifestLines.push(`${sha256(source)}  ${name}`);
  }
  await writeFile(resolve(capture, "manifest.sha256"), `${manifestLines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ captureId, postgresMajor: 17, ledgerVersions: versions.length,
    counts: Object.fromEntries([...files].filter(([name]) => name !== "capture-metadata.json").map(([name, value]) => [name, value.objects.length])),
    manifestEntries: manifestLines.length }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exitCode = 1;
}
