import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseCapturedLedger, validateAuthoritativeCapture } from "./lib/authoritative-evidence.mjs";
import { loadDatabaseGateScopeManifest, scopeConfiguration } from "./lib/database-gate-config.mjs";
import {
  BASELINE_FILE, collectStaticPreflightFailures, DISPOSABLE_CONFIRMATION,
  dockerEngineFailure, isolatedChildEnvironment, prepareIsolatedSupabaseProject,
  isArtifactDirectoryOutsideRepository, parseDatabaseTestCounts, runProcess,
  selectMigrationNames, validateDisposableProjectConfig, validateLocalSupabaseStatus,
} from "./lib/local-database-gate.mjs";
import { compareSchemaDumps } from "./lib/migration-governance.mjs";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "node_modules", "supabase", "dist", "supabase.js");

function usage() {
  console.log(`Usage: node scripts/run-local-database-gates.mjs [--preflight|--replay-only|--all]
  [--scope phase1|phase2|reconciliation-applied|reconciliation-full]
  [--baseline-candidate <private-sql> --capture-dir <private-capture>]
  [--artifact-dir <outside-repository-directory>]`);
}

function parse(argv) {
  const options = { mode: "--all", scope: "phase2", baselineCandidate: null, captureDirectory: null, artifactDirectory: null };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (["--preflight", "--replay-only", "--all"].includes(key)) options.mode = key;
    else if (["--scope", "--baseline-candidate", "--capture-dir", "--artifact-dir"].includes(key)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
      if (key === "--scope") options.scope = value;
      else if (key === "--baseline-candidate") options.baselineCandidate = resolve(value);
      else if (key === "--capture-dir") options.captureDirectory = resolve(value);
      else options.artifactDirectory = resolve(value);
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

const startedAt = new Date().toISOString();
const scopeManifest = await loadDatabaseGateScopeManifest(root).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error)); process.exit(1);
});
const configuredScope = scopeConfiguration(scopeManifest, options.scope);

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
  scope: options.scope, baselineCandidate: options.baselineCandidate, appliedVersions, scopeManifest,
});
if (options.artifactDirectory && !isArtifactDirectoryOutsideRepository(root, options.artifactDirectory)) {
  failures.push("--artifact-dir must resolve outside the repository");
}
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
const selected = selectMigrationNames(sourceNames, { scope: options.scope, appliedVersions, scopeManifest });
const migrationNames = options.scope.startsWith("reconciliation-")
  ? [BASELINE_FILE, ...selected.filter((name) => name !== BASELINE_FILE)] : selected;
const cliEnv = isolatedChildEnvironment();
const copyPaths = [...new Set([
  ...configuredScope.databaseTestPaths,
  ...configuredScope.fixtureSeedPaths,
  ...configuredScope.seededTestPaths,
  ...(options.scope.startsWith("reconciliation-") ? [] : ["seed.sql"]),
])];
const caseCounts = { passed: 0, failed: 0, skipped: 0 };

async function supabase(isolated, args, label, timeoutMs = 240_000, { print = false } = {}) {
  console.log(label);
  const result = await runProcess(process.execPath, [cli, ...args], { cwd: isolated.workspace, env: cliEnv, timeoutMs });
  if (result.code !== 0 || result.truncated) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed${detail ? `:\n${detail}` : ""}${result.truncated ? "\n[output truncated]" : ""}`);
  }
  if (print && result.stdout.trim()) process.stdout.write(result.stdout);
  return result;
}

async function assertDisposableConfig(isolated) {
  const config = await readFile(isolated.configPath, "utf8");
  const failures = validateDisposableProjectConfig(config);
  if (failures.length) throw new Error(`Unsafe disposable project configuration: ${failures.join("; ")}`);
}

async function assertLocalStatus(isolated) {
  await assertDisposableConfig(isolated);
  const result = await supabase(isolated, ["status", "--output", "json"], "Verifying disposable endpoints");
  let status;
  try { status = JSON.parse(result.stdout); }
  catch { throw new Error("Supabase status did not return valid redacted JSON"); }
  const statusFailures = validateLocalSupabaseStatus(status);
  if (statusFailures.length) throw new Error(`Unsafe Supabase status: ${statusFailures.join("; ")}`);
}

async function stopStack(isolated) {
  await assertDisposableConfig(isolated);
  const stopped = await runProcess(process.execPath, [cli, "stop", "--no-backup"], { cwd: isolated.workspace, env: cliEnv, timeoutMs: 120_000 }).catch(() => null);
  if (!stopped || stopped.code !== 0 || stopped.truncated) throw new Error(`The disposable ${DISPOSABLE_CONFIRMATION} stack could not be stopped safely.`);
}

function recordTestResult(result, label) {
  const counts = parseDatabaseTestCounts(`${result.stdout}\n${result.stderr}`);
  if (counts.passed + counts.failed + counts.skipped === 0) throw new Error(`${label} did not report any database test cases`);
  caseCounts.passed += counts.passed;
  caseCounts.failed += counts.failed;
  caseCounts.skipped += counts.skipped;
  if (counts.failed || counts.skipped) throw new Error(`${label} reported failed or skipped cases`);
}

async function disposeProject(isolated, attemptedStart) {
  const failures = [];
  if (attemptedStart) {
    try { await stopStack(isolated); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  try { await isolated.cleanup(); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  if (failures.length) throw new Error(`Disposable cleanup failed: ${failures.join("; ")}`);
}

async function newIsolatedProject() {
  return prepareIsolatedSupabaseProject(root, {
    migrationNames, baselineCandidate: options.baselineCandidate, copyPaths,
  });
}

async function replayCycle(number, runAssertions) {
  const isolated = await newIsolatedProject();
  let attemptedStart = false;
  const dumpPath = join(isolated.privateRoot, `replay-${number}.sql`);
  let operationError = null;
  try {
    attemptedStart = true;
    await supabase(isolated, ["start"], `Starting clean ${options.scope} replay ${number}`);
    await assertLocalStatus(isolated);
    await supabase(isolated, ["db", "reset", "--local", "--no-seed"], `Replaying selected migrations for cycle ${number}`, 360_000);
    if (runAssertions && !options.scope.startsWith("reconciliation-")) {
      for (const assertions of configuredScope.databaseTestPaths) {
        const label = `Running ${options.scope} database assertions from ${assertions}`;
        const result = await supabase(isolated, ["test", "db", `supabase/${assertions}`, "--local"], label, 240_000, { print: true });
        recordTestResult(result, label);
      }
    }
    await supabase(isolated, ["db", "dump", "--local", "--schema", "public", "--file", dumpPath], `Capturing schema-only replay ${number}`, 240_000);
    return readFile(dumpPath, "utf8");
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try { await disposeProject(isolated, attemptedStart); }
    catch (cleanupError) {
      if (operationError) console.error(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
      else throw cleanupError;
    }
  }
}

async function configureSeed(isolated, sqlPaths) {
  let config = await readFile(isolated.configPath, "utf8");
  config = config.replace(/(\[db\.seed\][\s\S]*?^enabled\s*=\s*)(?:true|false)\s*$/m, "$1true")
    .replace(/(\[db\.seed\][\s\S]*?^sql_paths\s*=\s*)\[[^\r\n]*\]/m, `$1${JSON.stringify(sqlPaths.map((path) => `./${path}`))}`);
  if (!/\[db\.seed\][\s\S]*?^enabled\s*=\s*true\s*$/m.test(config)) throw new Error("failed to enable only the selected disposable seed");
  await writeFile(isolated.configPath, config, "utf8");
}

async function seededCompatibilityCycle({ label, seedPaths, assertions = [] }) {
  const isolated = await newIsolatedProject();
  let attemptedStart = false;
  let operationError = null;
  try {
    await configureSeed(isolated, seedPaths); attemptedStart = true;
    await supabase(isolated, ["start"], `Starting ${label}`); await assertLocalStatus(isolated);
    await supabase(isolated, ["db", "reset", "--local"], `Replaying migrations with ${label}`, 360_000);
    for (const assertionPath of assertions) {
      const assertionLabel = `Validating ${label} from ${assertionPath}`;
      const result = await supabase(isolated, ["test", "db", `supabase/${assertionPath}`, "--local"], assertionLabel, 240_000, { print: true });
      recordTestResult(result, assertionLabel);
    }
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try { await disposeProject(isolated, attemptedStart); }
    catch (cleanupError) {
      if (operationError) console.error(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
      else throw cleanupError;
    }
  }
}

async function writeResultBundle({ schemaHash, catalogDigest }) {
  if (!options.artifactDirectory) return;
  await mkdir(options.artifactDirectory, { recursive: true });
  const artifactDirectory = await realpath(options.artifactDirectory);
  if (!isArtifactDirectoryOutsideRepository(root, artifactDirectory)) throw new Error("resolved artifact directory must remain outside the repository");
  const revisionResult = await runProcess("git", ["rev-parse", "HEAD"], { cwd: root, env: cliEnv, timeoutMs: 20_000 });
  if (revisionResult.code !== 0 || revisionResult.truncated || !/^[0-9a-f]{40}\s*$/.test(revisionResult.stdout)) throw new Error("could not resolve the release revision for the result bundle");
  const command = `node scripts/run-local-database-gates.mjs ${options.mode} --scope ${options.scope}`;
  const result = {
    schema: "agape.db-gate-result.v1",
    suiteId: `agape.db-gate.${options.scope}.v1`,
    suiteVersion: "1",
    releaseRevision: revisionResult.stdout.trim(),
    scope: options.scope,
    command,
    migrationListHash: createHash("sha256").update(`${migrationNames.join("\n")}\n`).digest("hex"),
    schemaHash,
    catalogDigest,
    catalogDigestSource: "normalized-public-schema",
    passedCases: caseCounts.passed,
    failedCases: caseCounts.failed,
    skippedCases: caseCounts.skipped,
    startedAt,
    completedAt: new Date().toISOString(),
    finalState: {
      applicationFlags: "false",
      profilingMode: "off",
      phase2Modes: "off",
      partnerMutationAuthority: "v1",
      proposalMutationAuthority: "v1"
    }
  };
  result.resultDigest = createHash("sha256").update(JSON.stringify(result)).digest("hex");
  const filename = `${result.suiteId.replaceAll(".", "-")}-${Date.now()}.json`;
  await writeFile(join(artifactDirectory, filename), `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`Sanitized result bundle written outside Git as ${basename(filename)}.`);
}

try {
  const first = await replayCycle(1, false);
  const second = await replayCycle(2, options.mode === "--all");
  const comparison = compareSchemaDumps(first, second);
  if (!comparison.equivalent) throw new Error(`clean replay schemas differ at normalized line ${comparison.firstDifferentLine ?? "unknown"}`);
  if (options.mode === "--all" && !options.scope.startsWith("reconciliation-")) {
    await seededCompatibilityCycle({
      label: `reviewed ${options.scope} synthetic fixture`,
      seedPaths: configuredScope.fixtureSeedPaths,
      assertions: configuredScope.seededTestPaths,
    });
    await seededCompatibilityCycle({ label: "legacy development seed compatibility check", seedPaths: ["seed.sql"] });
  }
  await writeResultBundle({ schemaHash: comparison.authoritative.sha256, catalogDigest: comparison.authoritative.sha256 });
  console.log(`Clean replay SHA-256: ${comparison.authoritative.sha256}`);
  console.log("Disposable replay completed. This console result is not release evidence by itself.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}
