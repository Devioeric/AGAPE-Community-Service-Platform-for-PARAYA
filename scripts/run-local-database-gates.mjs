import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseCapturedLedger, validateAuthoritativeCapture } from "./lib/authoritative-evidence.mjs";
import {
  BASELINE_FILE, collectStaticPreflightFailures, DISPOSABLE_CONFIRMATION,
  dockerEngineFailure, isolatedChildEnvironment, prepareIsolatedSupabaseProject,
  runProcess, selectMigrationNames, validateLocalSupabaseStatus,
} from "./lib/local-database-gate.mjs";
import { compareSchemaDumps } from "./lib/migration-governance.mjs";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "node_modules", "supabase", "dist", "supabase.js");

function usage() {
  console.log(`Usage: node scripts/run-local-database-gates.mjs [--preflight|--replay-only|--all]
  [--scope phase1|phase2|reconciliation-applied|reconciliation-full]
  [--baseline-candidate <private-sql> --capture-dir <private-capture>]`);
}

function parse(argv) {
  const options = { mode: "--all", scope: "phase2", baselineCandidate: null, captureDirectory: null };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (["--preflight", "--replay-only", "--all"].includes(key)) options.mode = key;
    else if (["--scope", "--baseline-candidate", "--capture-dir"].includes(key)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
      if (key === "--scope") options.scope = value;
      else options[key === "--baseline-candidate" ? "baselineCandidate" : "captureDirectory"] = resolve(value);
    } else if (key === "--help") options.help = true;
    else throw new Error(`unknown option ${key}`);
  }
  if (!["phase1", "phase2", "reconciliation-applied", "reconciliation-full"].includes(options.scope)) throw new Error("invalid --scope");
  if (options.scope.startsWith("reconciliation-") && (!options.baselineCandidate || !options.captureDirectory)) throw new Error("reconciliation scope requires --baseline-candidate and --capture-dir");
  return options;
}

let options;
try { options = parse(process.argv.slice(2)); }
catch (error) { console.error(error.message); usage(); process.exit(2); }
if (options.help) { usage(); process.exit(0); }

let appliedVersions = [];
if (options.scope.startsWith("reconciliation-")) {
  const capture = await validateAuthoritativeCapture({ captureDirectory: options.captureDirectory });
  if (!capture.valid) {
    console.error(`Private authoritative capture is invalid (${capture.problems.length} finding(s)); no contents were printed.`);
    process.exit(1);
  }
  const metadata = JSON.parse(await readFile(join(options.captureDirectory, "capture-metadata.json"), "utf8"));
  const ledger = parseCapturedLedger(await readFile(join(options.captureDirectory, "ledger", "versions.txt"), "utf8"), metadata.timestampedMigrationsApplied);
  if (ledger.problems.length) { console.error(`Captured ledger is invalid (${ledger.problems.length} finding(s)).`); process.exit(1); }
  appliedVersions = ledger.versions;
}

const failures = await collectStaticPreflightFailures(root, process.env, {
  scope: options.scope, baselineCandidate: options.baselineCandidate, appliedVersions,
});
const dockerFailure = await dockerEngineFailure(root);
if (dockerFailure) failures.push(dockerFailure);
if (options.mode !== "--preflight" && process.env.AGAPE_DB_TEST_CONFIRM_DISPOSABLE !== DISPOSABLE_CONFIRMATION) {
  failures.push(`set AGAPE_DB_TEST_CONFIRM_DISPOSABLE=${DISPOSABLE_CONFIRMATION} to authorize destruction of only the local ${DISPOSABLE_CONFIRMATION} database`);
}
if (failures.length) {
  console.error("Disposable database gate prerequisites failed:\n- " + failures.join("\n- "));
  console.error("No migration, seed, database reset, or evidence write was attempted.");
  process.exit(1);
}
if (options.mode === "--preflight") { console.log("Disposable database gate prerequisites are available. No database was changed."); process.exit(0); }

const sourceNames = await readdir(resolve(root, "supabase", "migrations"));
const selected = selectMigrationNames(sourceNames, { scope: options.scope, appliedVersions });
const migrationNames = options.scope.startsWith("reconciliation-")
  ? [BASELINE_FILE, ...selected.filter((name) => name !== BASELINE_FILE)] : selected;
const cliEnv = isolatedChildEnvironment();
const isolated = await prepareIsolatedSupabaseProject(root, {
  migrationNames, baselineCandidate: options.baselineCandidate,
});

async function supabase(args, label, timeoutMs = 240_000, { print = false } = {}) {
  console.log(label);
  const result = await runProcess(process.execPath, [cli, ...args], { cwd: isolated.workspace, env: cliEnv, timeoutMs });
  if (result.code !== 0 || result.truncated) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed${detail ? `:\n${detail}` : ""}${result.truncated ? "\n[output truncated]" : ""}`);
  }
  if (print && result.stdout.trim()) process.stdout.write(result.stdout);
  return result;
}

async function assertLocalStatus() {
  const result = await supabase(["status", "--output", "json"], "Verifying disposable endpoints");
  let status;
  try { status = JSON.parse(result.stdout); }
  catch { throw new Error("Supabase status did not return valid redacted JSON"); }
  const statusFailures = validateLocalSupabaseStatus(status);
  if (statusFailures.length) throw new Error(`Unsafe Supabase status: ${statusFailures.join("; ")}`);
}

async function stopStack() {
  const stopped = await runProcess(process.execPath, [cli, "stop", "--no-backup"], { cwd: isolated.workspace, env: cliEnv, timeoutMs: 120_000 }).catch(() => null);
  if (!stopped || stopped.code !== 0 || stopped.truncated) throw new Error(`The disposable ${DISPOSABLE_CONFIRMATION} stack could not be stopped safely.`);
}

async function replayCycle(number, runAssertions) {
  let attemptedStart = false;
  const dumpPath = join(isolated.privateRoot, `replay-${number}.sql`);
  try {
    attemptedStart = true;
    await supabase(["start"], `Starting clean ${options.scope} replay ${number}`);
    await assertLocalStatus();
    await supabase(["db", "reset", "--local", "--no-seed"], `Replaying selected migrations for cycle ${number}`, 360_000);
    if (runAssertions && !options.scope.startsWith("reconciliation-")) {
      const assertions = options.scope === "phase1" ? "supabase/tests/database/phase1" : "supabase/tests/database";
      await supabase(["test", "db", assertions, "--local"], `Running ${options.scope} database assertions`, 240_000, { print: true });
    }
    await supabase(["db", "dump", "--local", "--schema", "public", "--file", dumpPath], `Capturing schema-only replay ${number}`, 240_000);
    return readFile(dumpPath, "utf8");
  } finally { if (attemptedStart) await stopStack(); }
}

async function configureSeed(sqlPath) {
  let config = await readFile(isolated.configPath, "utf8");
  config = config.replace(/(\[db\.seed\][\s\S]*?^enabled\s*=\s*)(?:true|false)\s*$/m, "$1true")
    .replace(/(\[db\.seed\][\s\S]*?^sql_paths\s*=\s*)\[[^\r\n]*\]/m, `$1["${sqlPath}"]`);
  if (!/\[db\.seed\][\s\S]*?^enabled\s*=\s*true\s*$/m.test(config)) throw new Error("failed to enable only the selected disposable seed");
  await writeFile(isolated.configPath, config, "utf8");
}

async function seededCompatibilityCycle({ label, seedPath, assertions = null }) {
  let attemptedStart = false;
  try {
    await configureSeed(seedPath); attemptedStart = true;
    await supabase(["start"], `Starting ${label}`); await assertLocalStatus();
    await supabase(["db", "reset", "--local"], `Replaying migrations with ${label}`, 360_000);
    if (assertions) await supabase(["test", "db", assertions, "--local"], `Validating ${label}`, 240_000, { print: true });
  } finally { if (attemptedStart) await stopStack(); }
}

try {
  const first = await replayCycle(1, false);
  const second = await replayCycle(2, options.mode === "--all");
  const comparison = compareSchemaDumps(first, second);
  if (!comparison.equivalent) throw new Error(`clean replay schemas differ at normalized line ${comparison.firstDifferentLine ?? "unknown"}`);
  if (options.mode === "--all" && !options.scope.startsWith("reconciliation-")) {
    const seedPath = options.scope === "phase1" ? "./tests/fixtures/release-gate-phase1.sql" : "./tests/fixtures/release-gate-synthetic.sql";
    await seededCompatibilityCycle({ label: `reviewed ${options.scope} synthetic fixture`, seedPath, assertions: "supabase/tests/seeded" });
    await seededCompatibilityCycle({ label: "legacy development seed compatibility check", seedPath: "./seed.sql" });
  }
  console.log(`Clean replay SHA-256: ${comparison.authoritative.sha256}`);
  console.log("Disposable replay completed. This console result is not release evidence by itself.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
} finally {
  await isolated.cleanup().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
