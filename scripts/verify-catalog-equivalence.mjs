import { resolve } from "node:path";
import { compareCatalogCaptures } from "./lib/catalog-equivalence.mjs";

function usage() {
  console.log("Usage: node scripts/verify-catalog-equivalence.mjs --authoritative-capture <private-dir> --replay-capture <private-dir> [--json]");
}

function parse(argv) {
  const options = { authoritativeCapture: null, replayCapture: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--json") options.json = true;
    else if (key === "--authoritative-capture" || key === "--replay-capture") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${key} requires a path`);
      options[key === "--authoritative-capture" ? "authoritativeCapture" : "replayCapture"] = resolve(value);
    } else throw new Error(`unknown option ${key}`);
  }
  if (!options.authoritativeCapture || !options.replayCapture) throw new Error("both capture directories are required");
  return options;
}

try {
  const options = parse(process.argv.slice(2));
  const result = await compareCatalogCaptures(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Catalog equivalence: ${result.equivalent ? "PASS" : "FAIL"}`);
    console.log(`Objects/matched/differences: ${result.counts?.objects ?? 0}/${result.counts?.matched ?? 0}/${result.counts?.differences ?? 0}`);
    if (result.matrixDigest) console.log(`Reconciliation matrix SHA-256: ${result.matrixDigest}`);
    for (const row of result.rows.filter((item) => item.classification !== "Matched")) console.log(`- ${row.stableIdentifier}: ${row.classification}`);
    for (const problem of result.problems) console.error(`- ${problem}`);
  }
  if (!result.equivalent) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exitCode = 2;
}
