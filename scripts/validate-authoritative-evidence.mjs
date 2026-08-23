import { resolve } from "node:path";
import { isOutsideRepository, validateAuthoritativeCapture } from "./lib/authoritative-evidence.mjs";

function usage() { console.log("Usage: node scripts/validate-authoritative-evidence.mjs --capture-dir <private-dir> [--json]"); }

function parse(argv) {
  const result = { captureDirectory: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--json") result.json = true;
    else if (key === "--capture-dir") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--capture-dir requires a path");
      result.captureDirectory = resolve(value);
    } else throw new Error(`unknown option ${key}`);
  }
  if (!result.captureDirectory) throw new Error("--capture-dir is required");
  return result;
}

try {
  const options = parse(process.argv.slice(2));
  const root = resolve(import.meta.dirname, "..");
  if (!isOutsideRepository(root, options.captureDirectory)) throw new Error("authoritative capture must remain outside the repository");
  const report = await validateAuthoritativeCapture({ captureDirectory: options.captureDirectory });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Authoritative capture contract: ${report.valid ? "PASS" : "FAIL"}`);
    console.log(`Capture ID: ${report.captureId ?? "unavailable"}`);
    if (report.schema) console.log(`Schema bytes/hash: ${report.schema.bytes}/${report.schema.sha256}`);
    console.log(`Ledger versions: ${report.ledger.versions}; SHA-256: ${report.ledger.sha256 ?? "unavailable"}`);
    console.log(`Validated files: ${report.files.length}`);
    for (const problem of report.problems) console.error(`- ${problem}`);
  }
  if (!report.valid) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exitCode = 2;
}
