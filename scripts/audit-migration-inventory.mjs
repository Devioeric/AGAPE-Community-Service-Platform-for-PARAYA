import { resolve } from "node:path";
import {
  inventoryMigrationDirectory,
  readLedgerVersions,
} from "./lib/migration-governance.mjs";

function usage() {
  console.log(`Usage: node scripts/audit-migration-inventory.mjs [options]

Options:
  --check            Exit non-zero while a deterministic replay blocker exists.
  --json             Print stable JSON instead of the human-readable report.
  --ledger <path>    Compare against a private text capture containing one
                     14-digit supabase_migrations version per line.
  --empty-ledger-confirmed
                     Accept an empty ledger only after the authoritative
                     capture validator confirms no timestamped migrations.
  --help             Show this help.

This command is read-only. It never creates, renames, archives, or applies SQL.`);
}

function parseArguments(argv) {
  const options = { check: false, json: false, ledger: null, emptyLedgerConfirmed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--empty-ledger-confirmed") options.emptyLedgerConfirmed = true;
    else if (argument === "--ledger") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--ledger requires a file path.");
      options.ledger = resolve(value);
      index += 1;
    } else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function printHuman(report) {
  console.log("AGAPE migration inventory");
  console.log(`Canonical baseline: ${report.baseline.present ? "present" : "MISSING"} (${report.baseline.expected})`);
  console.log(`SQL files: ${report.totals.sql}; timestamped: ${report.totals.timestamped}; unordered legacy: ${report.totals.legacyUnordered}`);
  console.log(`Deterministic replay preflight: ${report.ready ? "PASS" : "BLOCKED"}`);

  console.log("\nTimestamped inputs (ledger order):");
  for (const item of report.timestamped) console.log(`- ${item.version}  ${item.file}`);

  console.log("\nUnordered legacy inputs (not an executable order):");
  if (!report.legacy.length) console.log("- none");
  for (const item of report.legacy) console.log(`- ${item.classification}  ${item.file}`);

  if (report.ledger) {
    console.log("\nCaptured ledger comparison:");
    console.log(`- latest applied: ${report.ledger.latestApplied ?? "none"}`);
    console.log(`- versions missing locally: ${report.ledger.missingLocally.length}`);
    console.log(`- local gaps before latest: ${report.ledger.gapsBeforeLatest.length}`);
    console.log(`- locally pending after latest: ${report.ledger.pendingAfterLatest.length}`);
  } else {
    console.log("\nCaptured ledger comparison: not supplied (use --ledger <private-version-list>)");
  }

  console.log("\nFindings:");
  if (!report.hazards.length) console.log("- none");
  for (const item of report.hazards) {
    console.log(`- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`);
    if (item.files.length <= 12 && item.files.length) console.log(`  Files/versions: ${item.files.join(", ")}`);
    else if (item.files.length) console.log(`  Files/versions: ${item.files.length} items (use --json for the complete list)`);
  }
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

  try {
    const root = resolve(import.meta.dirname, "..");
    if (options.emptyLedgerConfirmed && !options.ledger) throw new Error("--empty-ledger-confirmed requires --ledger");
    const ledgerVersions = options.ledger
      ? await readLedgerVersions(options.ledger, { allowEmpty: options.emptyLedgerConfirmed })
      : null;
    const report = await inventoryMigrationDirectory(resolve(root, "supabase/migrations"), { ledgerVersions });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    if (options.check && !report.ready) process.exitCode = 1;
  } catch (error) {
    console.error(`Migration inventory failed: ${error.message}`);
    process.exitCode = 2;
  }
}

await main();
