import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { REQUIRED_CAPTURE_FILES, parseCapturedLedger, sha256Buffer, validateAuthoritativeCapture } from "./lib/authoritative-evidence.mjs";
import { compareCatalogCaptures } from "./lib/catalog-equivalence.mjs";
import { loadDatabaseGateScopeManifest, scopeConfiguration } from "./lib/database-gate-config.mjs";
import {
  BASELINE_FILE, collectStaticPreflightFailures, DISPOSABLE_CONFIRMATION,
  dockerEngineFailure, isolatedChildEnvironment, prepareIsolatedSupabaseProject,
  isArtifactDirectoryOutsideRepository, parseDatabaseTestCounts, runProcess,
  selectMigrationNames, validateDisposableProjectConfig, validateLocalSupabaseStatus,
} from "./lib/local-database-gate.mjs";
import { compareSchemaDumps } from "./lib/migration-governance.mjs";
import { extractPublicCatalog, extractStoragePolicies, sanitizeStorageBuckets } from "./lib/sanitized-catalog-capture.mjs";
import { runPhase1HttpGates } from "./run-phase1-http-gates.mjs";
import { runPhase1BrowserGates } from "./run-phase1-browser-gates.mjs";
import { runPhase2HttpGates } from "./run-phase2-http-gates.mjs";
import { runPhase2BrowserGates } from "./run-phase2-browser-gates.mjs";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "node_modules", "supabase", "dist", "supabase.js");

function usage() {
  console.log(`Usage: node scripts/run-local-database-gates.mjs [--preflight|--replay-only|--fixture-only|--legacy-seed-only|--phase1-behavior-only|--phase1-e2e-only|--phase2-behavior-only|--phase2-e2e-only|--phase2-role-e2e-only|--phase2-community-needs-e2e-only|--all]
  [--scope phase1|phase2|reconciliation-applied|reconciliation-full]
  [--baseline-candidate <private-sql> --capture-dir <private-capture>]
  [--reconciliation-configuration <private-sql>] [--candidate-mode]
  [--artifact-dir <outside-repository-directory>]`);
}

function parse(argv) {
  const options = { mode: "--all", scope: "phase2", baselineCandidate: null, captureDirectory: null, reconciliationConfiguration: null, artifactDirectory: null, candidateMode: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (["--preflight", "--replay-only", "--fixture-only", "--legacy-seed-only", "--phase1-behavior-only", "--phase1-e2e-only", "--phase2-behavior-only", "--phase2-e2e-only", "--phase2-role-e2e-only", "--phase2-community-needs-e2e-only", "--all"].includes(key)) options.mode = key;
    else if (key === "--candidate-mode") options.candidateMode = true;
    else if (["--scope", "--baseline-candidate", "--capture-dir", "--reconciliation-configuration", "--artifact-dir"].includes(key)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
      if (key === "--scope") options.scope = value;
      else if (key === "--baseline-candidate") options.baselineCandidate = resolve(value);
      else if (key === "--capture-dir") options.captureDirectory = resolve(value);
      else if (key === "--reconciliation-configuration") options.reconciliationConfiguration = resolve(value);
      else options.artifactDirectory = resolve(value);
    } else if (key === "--help") options.help = true;
    else throw new Error(`unknown option ${key}`);
  }
  if (!["phase1", "phase2", "reconciliation-applied", "reconciliation-full"].includes(options.scope)) throw new Error("invalid --scope");
  if (options.scope.startsWith("reconciliation-") && (!options.baselineCandidate || !options.captureDirectory || !options.reconciliationConfiguration)) {
    throw new Error("reconciliation scope requires --baseline-candidate, --capture-dir, and --reconciliation-configuration");
  }
  if (options.candidateMode && (!['phase1','phase2'].includes(options.scope) || !options.baselineCandidate || !options.captureDirectory || !options.reconciliationConfiguration)) {
    throw new Error("--candidate-mode requires phase1/phase2 plus --baseline-candidate, --capture-dir, and --reconciliation-configuration");
  }
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
if (options.scope.startsWith("reconciliation-") || options.candidateMode) {
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
  scope: options.scope, baselineCandidate: options.baselineCandidate,
  reconciliationConfiguration: options.reconciliationConfiguration, candidateMode: options.candidateMode, appliedVersions, scopeManifest,
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
const selectableSourceNames = options.candidateMode && !sourceNames.includes(BASELINE_FILE) ? [BASELINE_FILE,...sourceNames] : sourceNames;
const selected = selectMigrationNames(selectableSourceNames, { scope: options.scope, appliedVersions, scopeManifest });
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
  console.log("Verifying disposable endpoints");
  const result = await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, "status", "--output", "json"], {
      cwd: isolated.workspace, env: cliEnv, windowsHide: true, shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks = [];
    let bytes = 0;
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes <= 1024 * 1024) chunks.push(chunk);
    });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Supabase status timed out")); }, 30_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0 || bytes > 1024 * 1024) reject(new Error("Supabase status failed or exceeded the safe in-memory limit"));
      else resolvePromise(Buffer.concat(chunks).toString("utf8"));
    });
  });
  let status;
  try { status = JSON.parse(result); }
  catch { throw new Error("Supabase status did not return valid JSON"); }
  const statusFailures = validateLocalSupabaseStatus(status);
  if (statusFailures.length) throw new Error(`Unsafe Supabase status: ${statusFailures.join("; ")}`);
  return status;
}

async function stopStack(isolated) {
  await assertDisposableConfig(isolated);
  const stopped = await runProcess(process.execPath, [cli, "stop", "--no-backup"], { cwd: isolated.workspace, env: cliEnv, timeoutMs: 120_000 }).catch(() => null);
  if (!stopped || stopped.code !== 0 || stopped.truncated) throw new Error(`The disposable ${DISPOSABLE_CONFIRMATION} stack could not be stopped safely.`);
}

async function readPhase1CountsFromDisposableDatabase(isolated) {
  await assertDisposableConfig(isolated);
  const query = `SELECT (SELECT count(*) FROM public.profiling_households),(SELECT count(*) FROM public.profiling_residents),(SELECT count(*) FROM public.profiling_submissions),(SELECT count(*) FROM public.profiling_events),(SELECT count(*) FROM public.profiling_import_batches),(SELECT count(*) FROM public.profiling_import_rows),(SELECT count(*) FROM public.profiling_lifecycle_events),(SELECT count(*) FROM public.audit_logs),(SELECT count(*) FROM storage.objects)`;
  const result = await runProcess("docker", [
    "exec", `supabase_db_${DISPOSABLE_CONFIRMATION}`, "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "\t", "-c", query,
  ], { cwd: isolated.workspace, env: cliEnv, timeoutMs: 30_000 });
  if (result.code !== 0 || result.truncated) throw new Error("fixed disposable Phase 1 count query failed");
  const values = result.stdout.trim().split("\t").map((value) => Number(value));
  const keys = ["profiling_households", "profiling_residents", "profiling_submissions", "profiling_events", "profiling_import_batches", "profiling_import_rows", "profiling_lifecycle_events", "audit_logs", "storage_objects"];
  if (values.length !== keys.length || values.some((value) => !Number.isInteger(value) || value < 0)) throw new Error("fixed disposable Phase 1 count query returned an invalid shape");
  return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
}

async function readPhase2CountsFromDisposableDatabase(isolated) {
  await assertDisposableConfig(isolated);
  const tables = [
    "partner_entities", "partner_contacts", "partnership_terms", "partnership_events",
    "legacy_account_partner_mappings", "historical_programs", "historical_program_versions",
    "historical_program_events", "historical_program_import_batches", "historical_program_import_rows",
    "historical_program_duplicate_decisions", "proposal_v2_profiles", "proposal_versions",
    "proposal_workflow_events_v2", "proposal_budget_revisions", "proposal_budget_items",
    "proposal_budget_funding_sources", "program_handoffs", "program_budget_revisions",
    "program_budget_items", "program_expenditures", "program_finance_events",
    "liquidation_submissions", "liquidation_expenditures", "partner_contact_email_outbox",
    "partner_contact_email_events", "partnership_reminder_deliveries", "notifications", "audit_logs",
  ];
  const selections = tables.map((table) => `(SELECT count(*) FROM public.${table}) AS ${table}`);
  selections.push("(SELECT count(*) FROM storage.objects) AS storage_objects");
  const query = `SELECT row_to_json(counts)::text FROM (SELECT ${selections.join(",")}) counts`;
  const result = await runProcess("docker", [
    "exec", `supabase_db_${DISPOSABLE_CONFIRMATION}`, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", query,
  ], { cwd: isolated.workspace, env: cliEnv, timeoutMs: 30_000 });
  if (result.code !== 0 || result.truncated) throw new Error("fixed disposable Phase 2 count query failed");
  let value;
  try { value = JSON.parse(result.stdout.trim()); }
  catch { throw new Error("fixed disposable Phase 2 count query returned invalid JSON"); }
  if (!value || Object.keys(value).length !== tables.length + 1 || Object.values(value).some((count) => !Number.isInteger(count) || count < 0)) {
    throw new Error("fixed disposable Phase 2 count query returned an invalid shape");
  }
  return value;
}

async function readWorkflowFingerprintFromDisposableDatabase(isolated) {
  await assertDisposableConfig(isolated);
  const query = `SELECT json_build_object('proposal_count',(SELECT count(*) FROM public.project_proposals),'proposal_state',(SELECT md5(coalesce(string_agg(id::text||':'||status,',' ORDER BY id),'')) FROM public.project_proposals),'program_count',(SELECT count(*) FROM public.programs),'program_state',(SELECT md5(coalesce(string_agg(id::text||':'||status,',' ORDER BY id),'')) FROM public.programs))::text`;
  const result = await runProcess("docker", [
    "exec", `supabase_db_${DISPOSABLE_CONFIRMATION}`, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", query,
  ], { cwd: isolated.workspace, env: cliEnv, timeoutMs: 30_000 });
  if (result.code !== 0 || result.truncated) throw new Error("fixed disposable workflow fingerprint query failed");
  let value;
  try { value = JSON.parse(result.stdout.trim()); }
  catch { throw new Error("fixed disposable workflow fingerprint returned invalid JSON"); }
  if (!Number.isInteger(value?.proposal_count) || !Number.isInteger(value?.program_count) || !/^[a-f0-9]{32}$/.test(value?.proposal_state) || !/^[a-f0-9]{32}$/.test(value?.program_state)) {
    throw new Error("fixed disposable workflow fingerprint returned an invalid shape");
  }
  return value;
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
    migrationNames, baselineCandidate: options.baselineCandidate,
    reconciliationConfiguration: options.reconciliationConfiguration, copyPaths,
  });
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function captureReplayCatalog({ isolated, cycle, publicSchema }) {
  if (!options.artifactDirectory || !options.scope.startsWith("reconciliation-")) return null;
  const captureDirectory = join(options.artifactDirectory, `${options.scope}-cycle-${cycle}-catalog`);
  const storageDump = join(isolated.privateRoot, `storage-${cycle}.sql`);
  const fullDump = join(isolated.privateRoot, `full-${cycle}.sql`);
  await supabase(isolated, ["db", "dump", "--local", "--schema", "storage", "--file", storageDump], `Capturing Storage catalog replay ${cycle}`, 240_000);
  await supabase(isolated, ["db", "dump", "--local", "--file", fullDump], `Capturing extension catalog replay ${cycle}`, 240_000);
  console.log(`Capturing sanitized bucket source replay ${cycle}`);
  const bucketResult = await runProcess("docker", [
    "exec", `supabase_db_${DISPOSABLE_CONFIRMATION}`, "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "\t", "-c",
    "SELECT id,name,public,COALESCE(file_size_limit::text,''),COALESCE(array_to_json(allowed_mime_types)::text,'null') FROM storage.buckets ORDER BY id",
  ], { cwd: isolated.workspace, env: cliEnv, timeoutMs: 30_000 });
  if (bucketResult.code !== 0 || bucketResult.truncated) throw new Error("read-only disposable bucket query failed");
  const replayBuckets = sanitizeStorageBuckets(bucketResult.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [id, name, isPublic, fileSizeLimit, mimeJson] = line.split("\t");
    if (!id || !name || !["t", "f"].includes(isPublic)) throw new Error("disposable bucket query returned a malformed row");
    return { id, name, public: isPublic === "t", file_size_limit: fileSizeLimit ? Number(fileSizeLimit) : null, allowed_mime_types: JSON.parse(mimeJson || "null") };
  }));
  const [storageSchema, extensionSchema] = await Promise.all([readFile(storageDump, "utf8"), readFile(fullDump, "utf8")]);
  const catalog = extractPublicCatalog(publicSchema, extensionSchema);
  const authoritativeExtensionCatalog = JSON.parse(await readFile(join(options.captureDirectory, "catalog", "extensions.json"), "utf8"));
  const extensionAllowlist = new Set((authoritativeExtensionCatalog.objects ?? []).map((item) => item.stableIdentifier));
  catalog.extensions = catalog.extensions.filter((item) => extensionAllowlist.has(item.stableIdentifier));
  const captureId = `AGAPE-REPLAY-${options.scope.toUpperCase()}-${cycle}-${Date.now()}`;
  const envelope = (objects, source) => ({ captureId, source, objects });
  const versions = migrationNames.map((name) => name.slice(0, 14));
  const files = new Map([
    ["capture-metadata.json", { schema: "agape.authoritative-capture.v1", captureId, environment: "disposable-clone", projectReference: "agape_release_gate", capturedAt: new Date().toISOString(), operator: "AGAPE Harness (Automation)", postgresMajor: 17, supabaseCliVersion: "2.114.0", schemaAllowlist: ["public"], timestampedMigrationsApplied: versions.length > 0 }],
    ["ledger/catalog.json", envelope(versions.map((version) => ({ stableIdentifier: `migration.${version}`, version })), "disposable-replay")],
    ["catalog/tables-columns.json", envelope(catalog.tablesColumns, "replay-public-schema")],
    ["catalog/constraints-indexes.json", envelope(catalog.constraintsIndexes, "replay-public-schema")],
    ["catalog/functions.json", envelope(catalog.functions, "replay-public-schema")],
    ["catalog/triggers.json", envelope(catalog.triggers, "replay-public-schema")],
    ["catalog/rls-policies.json", envelope(catalog.rlsPolicies, "replay-public-schema")],
    ["catalog/grants-default-privileges.json", envelope(catalog.grantsDefaultPrivileges, "replay-public-schema")],
    ["catalog/extensions.json", envelope(catalog.extensions, "replay-full-schema")],
    ["storage/buckets.json", envelope(replayBuckets, "replay-read-only-database-query")],
    ["storage/policies.json", envelope(extractStoragePolicies(storageSchema), "replay-storage-schema")],
  ]);
  await mkdir(join(captureDirectory, "schema"), { recursive: true });
  await writeFile(join(captureDirectory, "schema", "public-schema.sql"), publicSchema, "utf8");
  await mkdir(join(captureDirectory, "ledger"), { recursive: true });
  await writeFile(join(captureDirectory, "ledger", "versions.txt"), `${versions.join("\n")}\n`, "utf8");
  for (const [name, value] of files) await writeJson(join(captureDirectory, ...name.split("/")), value);
  const manifest = [];
  for (const name of REQUIRED_CAPTURE_FILES) {
    const source = await readFile(join(captureDirectory, ...name.split("/")));
    manifest.push(`${sha256Buffer(source)}  ${name}`);
  }
  await writeFile(join(captureDirectory, "manifest.sha256"), `${manifest.join("\n")}\n`, "utf8");
  return captureDirectory;
}

async function replayCycle(number, runAssertions) {
  const isolated = await newIsolatedProject();
  let attemptedStart = false;
  const dumpPath = join(isolated.privateRoot, `replay-${number}.sql`);
  let operationError = null;
  try {
    attemptedStart = true;
    await supabase(isolated, ["start"], `Starting clean ${options.scope} replay ${number}`, 900_000);
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
    const source = await readFile(dumpPath, "utf8");
    if (options.artifactDirectory && options.scope.startsWith("reconciliation-")) {
      await mkdir(options.artifactDirectory, { recursive: true });
      if (!isArtifactDirectoryOutsideRepository(root, options.artifactDirectory)) throw new Error("replay schema output must remain outside the repository");
      await writeFile(join(options.artifactDirectory, `${options.scope}-cycle-${number}-public-schema.sql`), source, { encoding: "utf8", flag: "wx" });
    }
    const catalogCapture = await captureReplayCatalog({ isolated, cycle: number, publicSchema: source });
    return { source, catalogCapture };
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

async function seededCompatibilityCycle({ label, seedPaths, assertions = [], behavioralPhase1 = false, behavioralPhase2 = false, browserPhase1 = false, browserPhase2 = false, browserPhase2Scenarios = null }) {
  const isolated = await newIsolatedProject();
  let attemptedStart = false;
  let operationError = null;
  try {
    await configureSeed(isolated, seedPaths); attemptedStart = true;
    await supabase(isolated, ["start"], `Starting ${label}`, 900_000); const localStatus = await assertLocalStatus(isolated);
    await supabase(isolated, ["db", "reset", "--local"], `Replaying migrations with ${label}`, 360_000);
    for (const assertionPath of assertions) {
      const assertionLabel = `Validating ${label} from ${assertionPath}`;
      const result = await supabase(isolated, ["test", "db", `supabase/${assertionPath}`, "--local"], assertionLabel, 240_000, { print: true });
      recordTestResult(result, assertionLabel);
    }
    if (behavioralPhase1) {
      console.log("Running Phase 1 Auth/PostgREST/RPC behavioral gates");
      const result = await runPhase1HttpGates({
        apiUrl: localStatus.API_URL,
        anonKey: localStatus.ANON_KEY,
        readCounts: () => readPhase1CountsFromDisposableDatabase(isolated),
      });
      caseCounts.passed += result.passed;
      caseCounts.failed += result.failed;
      caseCounts.skipped += result.skipped;
      if (result.failed || result.skipped || result.finalState?.profilingMode !== "off") throw new Error("Phase 1 behavioral gates did not finish in the required off state");
      console.log(`Phase 1 behavioral gates passed ${result.passed} case(s).`);
    }
    if (behavioralPhase2) {
      console.log("Running Phase 2 Auth/PostgREST/RPC/Storage/concurrency gates");
      const result = await runPhase2HttpGates({
        apiUrl: localStatus.API_URL,
        anonKey: localStatus.ANON_KEY,
        serviceRoleKey: localStatus.SERVICE_ROLE_KEY ?? localStatus.SECRET_KEY,
        readCounts: () => readPhase2CountsFromDisposableDatabase(isolated),
      });
      caseCounts.passed += result.passed;
      caseCounts.failed += result.failed;
      caseCounts.skipped += result.skipped;
      if (result.failed || result.skipped || result.finalState?.phase2Modes !== "off" || result.finalState?.partnerMutationAuthority !== "v1" || result.finalState?.proposalMutationAuthority !== "v1") {
        throw new Error("Phase 2 behavioral gates did not finish in the required off/V1 state");
      }
      console.log(`Phase 2 behavioral gates passed ${result.passed} case(s).`);
    }
    if (browserPhase1) {
      console.log("Running Phase 1 authenticated browser gates");
      const result = await runPhase1BrowserGates({
        root,
        apiUrl: localStatus.API_URL,
        anonKey: localStatus.ANON_KEY,
        serviceRoleKey: localStatus.SERVICE_ROLE_KEY ?? localStatus.SECRET_KEY,
        readWorkflowFingerprint: () => readWorkflowFingerprintFromDisposableDatabase(isolated),
      });
      caseCounts.passed += result.passed;
      caseCounts.failed += result.failed;
      caseCounts.skipped += result.skipped;
      if (result.failed || result.skipped || result.finalState?.profilingMode !== "off") throw new Error("Phase 1 browser gates did not finish in the required off state");
      console.log(`Phase 1 authenticated browser gates passed ${result.passed} case(s).`);
    }
    if (browserPhase2) {
      console.log("Running Phase 2 authenticated browser and AI privacy gates");
      const result = await runPhase2BrowserGates({
        root,
        apiUrl: localStatus.API_URL,
        anonKey: localStatus.ANON_KEY,
        serviceRoleKey: localStatus.SERVICE_ROLE_KEY ?? localStatus.SECRET_KEY,
        readWorkflowFingerprint: () => readWorkflowFingerprintFromDisposableDatabase(isolated),
        scenarioFilter: browserPhase2Scenarios,
      });
      caseCounts.passed += result.passed;
      caseCounts.failed += result.failed;
      caseCounts.skipped += result.skipped;
      if (result.failed || result.skipped || result.finalState?.phase2Modes !== "off" || result.finalState?.partnerMutationAuthority !== "v1" || result.finalState?.proposalMutationAuthority !== "v1") {
        throw new Error("Phase 2 browser gates did not finish in the required off/V1 state");
      }
      console.log(`Phase 2 authenticated browser gates passed ${result.passed} case(s).`);
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

async function writeResultBundle({ schemaHash, catalogDigest, authoritativeSchemaHash = null, authoritativeEquivalent = null }) {
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
    authoritativeSchemaHash,
    authoritativeEquivalent,
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
  if (options.mode === "--fixture-only") {
    if (options.scope.startsWith("reconciliation-")) throw new Error("--fixture-only requires phase1 or phase2 scope");
    await seededCompatibilityCycle({
      label: `reviewed ${options.scope} synthetic fixture diagnostic`,
      seedPaths: configuredScope.fixtureSeedPaths,
      assertions: configuredScope.seededTestPaths,
    });
    console.log(`${options.scope} synthetic fixture diagnostic passed. This diagnostic is not release evidence by itself.`);
    process.exit(0);
  }
  if (options.mode === "--phase1-e2e-only") {
    if (options.scope !== "phase1") throw new Error("--phase1-e2e-only requires --scope phase1");
    await seededCompatibilityCycle({
      label: "Phase 1 authenticated browser fixture",
      seedPaths: configuredScope.fixtureSeedPaths,
      assertions: configuredScope.seededTestPaths,
      browserPhase1: true,
    });
    console.log("Phase 1 authenticated browser diagnostic passed. This diagnostic is not release evidence by itself.");
    process.exit(0);
  }
  if (options.mode === "--phase1-behavior-only") {
    if (options.scope !== "phase1") throw new Error("--phase1-behavior-only requires --scope phase1");
    await seededCompatibilityCycle({
      label: "Phase 1 behavioral diagnostic fixture",
      seedPaths: configuredScope.fixtureSeedPaths,
      assertions: configuredScope.seededTestPaths,
      behavioralPhase1: true,
    });
    console.log("Phase 1 behavioral diagnostic passed. This diagnostic is not release evidence by itself.");
    process.exit(0);
  }
  if (options.mode === "--phase2-behavior-only") {
    if (options.scope !== "phase2") throw new Error("--phase2-behavior-only requires --scope phase2");
    await seededCompatibilityCycle({
      label: "Phase 2 behavioral diagnostic fixture",
      seedPaths: configuredScope.fixtureSeedPaths,
      assertions: configuredScope.seededTestPaths,
      behavioralPhase2: true,
    });
    console.log("Phase 2 behavioral diagnostic passed. This diagnostic is not release evidence by itself.");
    process.exit(0);
  }
  if (options.mode === "--phase2-e2e-only") {
    if (options.scope !== "phase2") throw new Error("--phase2-e2e-only requires --scope phase2");
    await seededCompatibilityCycle({
      label: "Phase 2 authenticated browser fixture",
      seedPaths: configuredScope.fixtureSeedPaths,
      assertions: configuredScope.seededTestPaths,
      browserPhase2: true,
    });
    console.log("Phase 2 authenticated browser diagnostic passed. This diagnostic is not release evidence by itself.");
    process.exit(0);
  }
  if (options.mode === "--phase2-role-e2e-only") {
    if (options.scope !== "phase2") throw new Error("--phase2-role-e2e-only requires --scope phase2");
    await seededCompatibilityCycle({
      label: "Phase 2 role-surface browser fixture",
      seedPaths: configuredScope.fixtureSeedPaths,
      assertions: configuredScope.seededTestPaths,
      browserPhase2: true,
      browserPhase2Scenarios: ["role_surfaces", "community_needs_workflow"],
    });
    console.log("Phase 2 role-surface browser diagnostic passed. This diagnostic is not release evidence by itself.");
    process.exit(0);
  }
  if (options.mode === "--phase2-community-needs-e2e-only") {
    if (options.scope !== "phase2") throw new Error("--phase2-community-needs-e2e-only requires --scope phase2");
    await seededCompatibilityCycle({
      label: "Phase 2 community-needs browser fixture",
      seedPaths: configuredScope.fixtureSeedPaths,
      assertions: configuredScope.seededTestPaths,
      browserPhase2: true,
      browserPhase2Scenarios: ["community_needs_workflow"],
    });
    console.log("Phase 2 community-needs browser diagnostic passed. This diagnostic is not release evidence by itself.");
    process.exit(0);
  }
  if (options.mode === "--legacy-seed-only") {
    await seededCompatibilityCycle({ label: "legacy development seed compatibility check", seedPaths: ["seed.sql"] });
    console.log("Legacy development seed compatibility passed. This diagnostic is not release evidence by itself.");
    process.exit(0);
  }
  const first = await replayCycle(1, false);
  const second = await replayCycle(2, options.mode === "--all");
  const comparison = compareSchemaDumps(first.source, second.source);
  if (!comparison.equivalent) throw new Error(`clean replay schemas differ at normalized line ${comparison.firstDifferentLine ?? "unknown"}`);
  let authoritativeComparison = null;
  if (options.scope === "reconciliation-applied") {
    const authoritativeSchema = await readFile(join(options.captureDirectory, "schema", "public-schema.sql"), "utf8");
    authoritativeComparison = compareSchemaDumps(authoritativeSchema, first.source);
    if (!authoritativeComparison.equivalent) {
      throw new Error(`authoritative and replay schemas differ at normalized line ${authoritativeComparison.firstDifferentLine ?? "unknown"}; private replay dumps were retained for review`);
    }
  }
  let catalogComparison = null;
  if (options.scope.startsWith("reconciliation-") && first.catalogCapture && second.catalogCapture) {
    if (options.scope === "reconciliation-applied") {
      const [firstCatalog, secondCatalog] = await Promise.all([
        compareCatalogCaptures({ authoritativeCapture: options.captureDirectory, replayCapture: first.catalogCapture }),
        compareCatalogCaptures({ authoritativeCapture: options.captureDirectory, replayCapture: second.catalogCapture }),
      ]);
      if (!firstCatalog.equivalent || !secondCatalog.equivalent) {
        const differences = Math.max(firstCatalog.counts?.differences ?? 0, secondCatalog.counts?.differences ?? 0);
        throw new Error(`authoritative and replay catalogs differ across ${differences} object(s); private hash-only captures were retained for review`);
      }
      catalogComparison = firstCatalog;
    } else {
      const deterministicCatalog = await compareCatalogCaptures({
        authoritativeCapture: first.catalogCapture, replayCapture: second.catalogCapture,
        authoritativeAllowedEnvironments: ["disposable-clone"], replayAllowedEnvironments: ["disposable-clone"],
      });
      if (!deterministicCatalog.equivalent) {
        throw new Error(`full target replay catalogs differ across ${deterministicCatalog.counts?.differences ?? 0} object(s)`);
      }
      catalogComparison = deterministicCatalog;
    }
  }
  if (options.mode === "--all" && !options.scope.startsWith("reconciliation-")) {
    await seededCompatibilityCycle({
      label: `reviewed ${options.scope} synthetic fixture`,
      seedPaths: configuredScope.fixtureSeedPaths,
      assertions: configuredScope.seededTestPaths,
      behavioralPhase1: options.scope === "phase1",
      behavioralPhase2: options.scope === "phase2",
    });
    await seededCompatibilityCycle({ label: "legacy development seed compatibility check", seedPaths: ["seed.sql"] });
  }
  await writeResultBundle({
    schemaHash: comparison.authoritative.sha256,
    catalogDigest: catalogComparison?.matrixDigest ?? comparison.authoritative.sha256,
    authoritativeSchemaHash: authoritativeComparison?.authoritative.sha256 ?? null,
    authoritativeEquivalent: authoritativeComparison?.equivalent ?? null,
  });
  console.log(`Clean replay SHA-256: ${comparison.authoritative.sha256}`);
  console.log("Disposable replay completed. This console result is not release evidence by itself.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}
