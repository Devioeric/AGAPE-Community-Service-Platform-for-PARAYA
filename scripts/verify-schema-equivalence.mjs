import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compareSchemaDumps } from "./lib/migration-governance.mjs";

function usage() {
  console.log(`Usage: node scripts/verify-schema-equivalence.mjs \\
  --authoritative <schema-only.sql> --replay <schema-only.sql> [--json]

Both inputs must be schema-only pg_dump outputs captured with the same PostgreSQL
major version, schemas, and flags. The command is conservative: any normalized
difference fails. It prints hashes and the first differing line number, never SQL
contents. It does not create or promote a canonical baseline.`);
}

function parseArguments(argv) {
  const options = { authoritative: null, replay: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--authoritative" || argument === "--replay") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a file path.`);
      options[argument.slice(2)] = resolve(value);
      index += 1;
    } else if (argument === "--json") options.json = true;
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    usage();
    return;
  }
  if (!options.authoritative || !options.replay) {
    console.error("Both --authoritative and --replay are required.");
    usage();
    process.exitCode = 2;
    return;
  }
  if (options.authoritative === options.replay) {
    console.error("Authoritative and replay captures must be different files.");
    process.exitCode = 2;
    return;
  }

  try {
    const [authoritative, replay] = await Promise.all([
      readFile(options.authoritative, "utf8"),
      readFile(options.replay, "utf8"),
    ]);
    const result = compareSchemaDumps(authoritative, replay);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Schema equivalence: ${result.equivalent ? "PASS" : "FAIL"}`);
      console.log(`Authoritative normalized SHA-256: ${result.authoritative.sha256}`);
      console.log(`Replay normalized SHA-256:        ${result.replay.sha256}`);
      if (result.authoritative.problems.length) console.log(`Authoritative capture rejected: ${result.authoritative.problems.join(" ")}`);
      if (result.replay.problems.length) console.log(`Replay capture rejected: ${result.replay.problems.join(" ")}`);
      if (result.firstDifferentLine !== null) console.log(`First normalized difference: line ${result.firstDifferentLine} (contents intentionally not printed)`);
    }
    if (!result.equivalent) process.exitCode = 1;
  } catch (error) {
    console.error(`Schema comparison failed: ${error.message}`);
    process.exitCode = 2;
  }
}

await main();
