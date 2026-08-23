import { resolve } from "node:path";
import { validateAuthoritativeEvidence } from "./lib/authoritative-evidence.mjs";

function usage() {
  console.log("Usage: node scripts/validate-authoritative-evidence.mjs --schema <schema-only.sql> --ledger <versions.txt> --catalog-dir <private-dir> [--json]");
}

function parse(argv) {
  const result = { schema: null, ledger: null, catalogDir: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--json") result.json = true;
    else if (["--schema", "--ledger", "--catalog-dir"].includes(key)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${key} requires a path`);
      result[key === "--catalog-dir" ? "catalogDir" : key.slice(2)] = resolve(value);
    } else throw new Error(`unknown option ${key}`);
  }
  if (!result.schema || !result.ledger || !result.catalogDir) throw new Error("schema, ledger, and catalog-dir are required");
  return result;
}

try {
  const options = parse(process.argv.slice(2));
  const report = await validateAuthoritativeEvidence({
    schemaPath: options.schema,
    ledgerPath: options.ledger,
    catalogDirectory: options.catalogDir,
  });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Authoritative evidence contract: ${report.valid ? "PASS" : "FAIL"}`);
    console.log(`Schema SHA-256: ${report.schema.sha256}`);
    console.log(`Ledger versions: ${report.ledger.versions}; SHA-256: ${report.ledger.sha256}`);
    for (const catalog of report.catalogs) console.log(`${catalog.name}: ${catalog.bytes} bytes; SHA-256: ${catalog.sha256}`);
    for (const problem of report.problems) console.error(`- ${problem}`);
  }
  if (!report.valid) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exitCode = 2;
}
