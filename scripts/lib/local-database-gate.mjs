import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import {
  DATABASE_GATE_SCOPE_FILE,
  EXPECTED_DISPOSABLE_PROJECT_ID,
  EXPECTED_POSTGRES_MAJOR,
  EXPECTED_SOURCE_PROJECT_ID,
  EXPECTED_SUPABASE_CLI_VERSION,
  loadDatabaseGateScopeManifest,
  scopeConfiguration,
} from "./database-gate-config.mjs";

export const BASELINE_FILE = "20260815000000_pre_phase0_baseline.sql";
export const DISPOSABLE_CONFIRMATION = "agape-release-gate";
export const PHASE_FLAGS = [
  "AGAPE_PROFILING_V2_ENABLED",
  "AGAPE_PARTNER_REGISTRY_V2_ENABLED",
  "AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED",
  "AGAPE_PROPOSALS_V2_ENABLED",
  "AGAPE_PROGRAM_FINANCE_V2_ENABLED",
  "AGAPE_EXTERNAL_CONTACT_EMAIL_ENABLED",
  "AGAPE_LEGACY_ACCOUNT_SUSPENSION_ENABLED",
];

const TIMESTAMPED_MIGRATION = /^(\d{14})_[a-z0-9_]+\.sql$/;

export function selectMigrationNames(names, { scope = "phase2", appliedVersions = [], scopeManifest } = {}) {
  const timestamped = names.filter((name) => TIMESTAMPED_MIGRATION.test(name)).sort();
  if (!scopeManifest) throw new Error("database-gate scope manifest is required");
  if (scope === "phase1" || scope === "phase2") {
    const configured = scopeConfiguration(scopeManifest, scope).migrationNames;
    const available = new Set(timestamped);
    const missing = configured.filter((name) => !available.has(name));
    if (missing.length) throw new Error(`${scope} scope references missing migrations: ${missing.join(", ")}`);
    return [...configured];
  }
  if (scope === "reconciliation-full") {
    const configured = scopeConfiguration(scopeManifest, "phase2").migrationNames;
    const available = new Set(timestamped);
    const missing = configured.filter((name) => name !== BASELINE_FILE && !available.has(name));
    if (missing.length) throw new Error(`reconciliation-full references missing migrations: ${missing.join(", ")}`);
    return [...configured];
  }
  if (scope === "reconciliation-applied") {
    const known = new Map(timestamped.map((name) => [name.slice(0, 14), name]));
    const unknown = appliedVersions.filter((version) => !known.has(version));
    if (unknown.length) throw new Error(`captured ledger references migrations absent from the repository: ${unknown.join(", ")}`);
    return [BASELINE_FILE, ...appliedVersions.map((version) => known.get(version)).filter((name) => name !== BASELINE_FILE)];
  }
  throw new Error(`unsupported database-gate scope ${scope}`);
}

export function inspectMigrationNames(names) {
  const sqlNames = names.filter((name) => name.endsWith(".sql")).sort();
  const failures = [];
  const unordered = sqlNames.filter((name) => !TIMESTAMPED_MIGRATION.test(name));
  if (unordered.length) {
    failures.push(`active migration directory contains non-timestamped SQL: ${unordered.join(", ")}`);
  }

  const timestamps = new Map();
  for (const name of sqlNames) {
    const match = name.match(TIMESTAMPED_MIGRATION);
    if (!match) continue;
    const prior = timestamps.get(match[1]);
    if (prior) failures.push(`duplicate migration timestamp ${match[1]}: ${prior}, ${name}`);
    else timestamps.set(match[1], name);
  }

  if (!sqlNames.includes(BASELINE_FILE)) failures.push(`verified canonical baseline ${BASELINE_FILE} is missing`);
  else if (sqlNames[0] !== BASELINE_FILE) failures.push(`${BASELINE_FILE} is not the first active migration`);

  return failures;
}

export function redactProcessOutput(value) {
  return String(value)
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+(@)/gi, "$1[REDACTED]$2")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/\bsb_secret_[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_SUPABASE_SECRET]")
    .replace(/\b((?:SUPABASE_)?(?:SERVICE_ROLE|ANON|JWT|ACCESS)_?(?:KEY|SECRET|TOKEN)|SUPABASE_DB_PASSWORD)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}

const CHILD_ENVIRONMENT_ALLOWLIST = new Set([
  "CI", "COMSPEC", "LANG", "LC_ALL", "NO_COLOR", "PATH", "PATHEXT",
  "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "TERM", "TMP", "WINDIR",
]);

export function isolatedChildEnvironment(env = process.env) {
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    if (CHILD_ENVIRONMENT_ALLOWLIST.has(key.toUpperCase()) && typeof value === "string") result[key] = value;
  }
  for (const flag of PHASE_FLAGS) result[flag] = "false";
  result.AGAPE_DB_TEST_ISOLATED = "true";
  result.NO_PROXY = "127.0.0.1,localhost,::1";
  return result;
}

function safeSupabaseRelativePath(value) {
  const normalized = String(value).replaceAll("\\", "/");
  if (!normalized || isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error("refusing to copy an unsafe Supabase test path");
  }
  return normalized;
}

export async function prepareIsolatedSupabaseProject(root, {
  migrationNames = null, baselineCandidate = null, reconciliationConfiguration = null, copyPaths = [],
} = {}) {
  const privateRoot = await mkdtemp(join(tmpdir(), "agape-release-gate-"));
  const workspace = join(privateRoot, "workspace");
  const source = join(root, "supabase");
  const target = join(workspace, "supabase");
  await mkdir(target, { recursive: true });
  const targetMigrations = join(target, "migrations");
  await mkdir(targetMigrations, { recursive: true });
  const names = migrationNames ?? await readdir(join(source, "migrations"));
  for (const name of names) {
    if (name === BASELINE_FILE && baselineCandidate) await cp(resolve(baselineCandidate), join(targetMigrations, BASELINE_FILE));
    else await cp(join(source, "migrations", name), join(targetMigrations, name));
  }
  if (reconciliationConfiguration) {
    await cp(resolve(reconciliationConfiguration), join(targetMigrations, "20260815000001_reconciliation_configuration.sql"));
  }
  for (const rawPath of copyPaths) {
    const path = safeSupabaseRelativePath(rawPath);
    const sourcePath = join(source, path);
    const targetPath = join(target, path);
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { recursive: true });
  }

  let config = await readFile(join(source, "config.toml"), "utf8");
  if (!/^project_id\s*=\s*"agape-local"\s*$/m.test(config)) throw new Error("source Supabase project_id is not agape-local");
  if (!/\[db\.seed\][\s\S]*?^enabled\s*=\s*true\s*$/m.test(config)) throw new Error("source Supabase seed setting is not explicit");
  config = config
    .replace(/^project_id\s*=\s*"agape-local"\s*$/m, `project_id = "${DISPOSABLE_CONFIRMATION}"`)
    .replace(/(\[db\.seed\][\s\S]*?^enabled\s*=\s*)true\s*$/m, "$1false");
  await writeFile(join(target, "config.toml"), config, "utf8");

  return {
    privateRoot,
    workspace,
    configPath: join(target, "config.toml"),
    async cleanup() {
      const resolved = validateDisposableCleanupTarget(privateRoot);
      await rm(resolved, { recursive: true, force: true });
    },
  };
}

export function validateDisposableCleanupTarget(path) {
  const resolved = resolve(path);
  const temp = `${resolve(tmpdir())}${sep}`;
  if (!resolved.startsWith(temp) || !basename(resolved).startsWith("agape-release-gate-")) {
    throw new Error("refusing to remove a directory outside the AGAPE release-gate temp root");
  }
  return resolved;
}

export function validateSupabaseConfig(config, manifest) {
  const failures = [];
  const expected = manifest ?? {
    sourceProjectId: EXPECTED_SOURCE_PROJECT_ID,
    postgresMajorVersion: EXPECTED_POSTGRES_MAJOR,
    ports: { api: 54321, database: 54322, shadow: 54320, studio: 54323, inbucket: 54324 },
  };
  if (!new RegExp(`^project_id\\s*=\\s*"${expected.sourceProjectId}"\\s*$`, "m").test(config)) failures.push(`Supabase project_id must be exactly ${expected.sourceProjectId}`);
  const sections = [
    ["api", "port", expected.ports.api], ["db", "port", expected.ports.database],
    ["db", "shadow_port", expected.ports.shadow], ["studio", "port", expected.ports.studio],
    ["inbucket", "port", expected.ports.inbucket], ["db", "major_version", expected.postgresMajorVersion],
  ];
  for (const [section, key, value] of sections) {
    const pattern = new RegExp(`\\[${section.replace(".", "\\.")}\\][\\s\\S]*?^${key}\\s*=\\s*${value}\\s*$`, "m");
    if (!pattern.test(config)) failures.push(`${section}.${key} must be ${value}`);
  }
  return failures;
}

export function validateInstalledSupabaseCliPackage(packageJson) {
  if (!packageJson || packageJson.version !== EXPECTED_SUPABASE_CLI_VERSION) {
    return [`repository-local Supabase CLI must be exactly ${EXPECTED_SUPABASE_CLI_VERSION}`];
  }
  return [];
}

export async function findForbiddenSupabaseLinkMetadata(root) {
  const candidates = [
    "supabase/.temp", "supabase/.branches", "supabase/.linked", "supabase/.project-ref",
  ];
  const found = [];
  for (const candidate of candidates) {
    try {
      const path = resolve(root, candidate);
      const metadata = await stat(path);
      if (metadata.isDirectory()) {
        // The repository-local CLI may leave an empty `.temp` cache directory
        // after version/help checks. Only actual link metadata is forbidden.
        if ((await readdir(path)).length > 0) found.push(candidate);
      } else {
        found.push(candidate);
      }
    } catch { /* absent is safe */ }
  }
  return found;
}

export async function findMissingGateInputs(root, relativePaths) {
  const missing = [];
  for (const relativePath of relativePaths) {
    try { await access(resolve(root, relativePath), fsConstants.R_OK); }
    catch { missing.push(relativePath); }
  }
  return missing;
}

export async function collectStaticPreflightFailures(root, env = process.env, {
  scope = "phase2", baselineCandidate = null, reconciliationConfiguration = null, candidateMode = false, appliedVersions = [], scopeManifest = null,
} = {}) {
  const failures = [];
  const migrationDir = resolve(root, "supabase", "migrations");
  const configPath = resolve(root, "supabase", "config.toml");
  const cliPath = resolve(root, "node_modules", "supabase", "dist", "supabase.js");
  let manifest = scopeManifest;
  try { manifest ??= await loadDatabaseGateScopeManifest(root); }
  catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  const configuredScope = manifest ? scopeConfiguration(manifest, scope) : null;
  const requiredRelativePaths = new Set([DATABASE_GATE_SCOPE_FILE]);
  if (configuredScope) {
    for (const key of ["databaseTestPaths", "fixtureSeedPaths", "seededTestPaths"]) {
      for (const path of configuredScope[key]) requiredRelativePaths.add(`supabase/${path}`);
    }
    if (!scope.startsWith("reconciliation-")) requiredRelativePaths.add("supabase/seed.sql");
  }

  let migrationNames = [];
  try {
    migrationNames = await readdir(migrationDir);
    if (scope.startsWith("reconciliation-") || candidateMode) {
      const label = candidateMode ? "candidate gate" : "reconciliation replay";
      if (!baselineCandidate) failures.push(`${label} requires a private baseline candidate`);
      else {
        try { await access(resolve(baselineCandidate), fsConstants.R_OK); }
        catch { failures.push("private baseline candidate is missing or unreadable"); }
      }
      if (!reconciliationConfiguration) failures.push(`${label} requires private environment configuration`);
      else {
        try { await access(resolve(reconciliationConfiguration), fsConstants.R_OK); }
        catch { failures.push("private reconciliation configuration is missing or unreadable"); }
      }
      const candidateNames = migrationNames.includes(BASELINE_FILE) ? migrationNames : [BASELINE_FILE,...migrationNames];
      const selected = selectMigrationNames(candidateNames, { scope, appliedVersions, scopeManifest: manifest });
      failures.push(...inspectMigrationNames([BASELINE_FILE, ...selected.filter((name) => name !== BASELINE_FILE)]));
    } else {
      failures.push(...inspectMigrationNames(migrationNames));
      if (manifest) {
        try {
          const selected = selectMigrationNames(migrationNames, { scope, appliedVersions, scopeManifest: manifest });
          const selectedSet = new Set(selected);
          if (scope === "phase2") {
            const unexpected = migrationNames.filter((name) => TIMESTAMPED_MIGRATION.test(name) && !selectedSet.has(name));
            if (unexpected.length) failures.push(`timestamped migrations are absent from the Phase 2 scope manifest: ${unexpected.join(", ")}`);
          }
        } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
      }
    }
  } catch {
    failures.push("supabase/migrations is missing or unreadable");
  }

  if (candidateMode && baselineCandidate) {
    try {
      const baseline = await readFile(resolve(baselineCandidate), "utf8");
      if (baseline.trim().length < 1_000) failures.push("private baseline candidate is unexpectedly small");
    } catch {
      failures.push("private baseline candidate cannot be read");
    }
  } else if (migrationNames.includes(BASELINE_FILE)) {
    try {
      const baseline = await readFile(resolve(migrationDir, BASELINE_FILE), "utf8");
      if (baseline.trim().length < 1_000) failures.push("canonical baseline is unexpectedly small and is not accepted as verified");
    } catch {
      failures.push("canonical baseline cannot be read");
    }
  }

  try {
    const config = await readFile(configPath, "utf8");
    failures.push(...validateSupabaseConfig(config, manifest));
  } catch {
    failures.push("supabase/config.toml is missing or unreadable");
  }

  try {
    await access(cliPath, fsConstants.R_OK);
    const cliPackage = JSON.parse(await readFile(resolve(root, "node_modules", "supabase", "package.json"), "utf8"));
    failures.push(...validateInstalledSupabaseCliPackage(cliPackage));
  } catch {
    failures.push("repository-local Supabase CLI is missing; run npm ci before database gates");
  }

  for (const relativePath of await findMissingGateInputs(root, requiredRelativePaths)) {
    failures.push(`required database-gate input is missing: ${relativePath}`);
  }

  const linkMetadata = await findForbiddenSupabaseLinkMetadata(root);
  if (linkMetadata.length) failures.push(`remote Supabase link metadata must be removed before testing: ${linkMetadata.join(", ")}`);

  for (const flag of PHASE_FLAGS) {
    if (env[flag] === "true") failures.push(`${flag} must be false during disposable replay`);
  }

  return failures;
}

export function runProcess(command, args, { cwd, env = isolatedChildEnvironment(), timeoutMs = 180_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    const maxOutputBytes = 4 * 1024 * 1024;
    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes <= maxOutputBytes) target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const result = {
        code: code ?? 1,
        stdout: redactProcessOutput(Buffer.concat(stdout).toString("utf8")),
        stderr: redactProcessOutput(Buffer.concat(stderr).toString("utf8")),
        truncated: outputBytes > maxOutputBytes,
      };
      resolvePromise(result);
    });
  });
}

export async function dockerEngineFailure(root) {
  try {
    const result = await runProcess("docker", ["version", "--format", "{{.Server.Version}}"], { cwd: root, timeoutMs: 20_000 });
    if (result.code !== 0 || !result.stdout.trim()) return "Docker engine is unavailable";
    return null;
  } catch {
    return "Docker CLI or Docker engine is unavailable";
  }
}

export function assertSuccessfulProcessResult(result, label) {
  if (!result || result.code !== 0) throw new Error(`${label} failed`);
  if (result.truncated) throw new Error(`${label} output was truncated`);
  return result;
}

export function validateDisposableProjectConfig(config) {
  const failures = validateSupabaseConfig(config, {
    sourceProjectId: EXPECTED_DISPOSABLE_PROJECT_ID,
    postgresMajorVersion: EXPECTED_POSTGRES_MAJOR,
    ports: { api: 54321, database: 54322, shadow: 54320, studio: 54323, inbucket: 54324 },
  }).map((failure) => failure.replace("Supabase project_id", "disposable project ID"));
  if (config.includes(".temp") || /project[_-]?ref/i.test(config)) failures.push("disposable config contains linked-project metadata");
  return failures;
}

export function validateLocalSupabaseStatus(status, allowedPorts = [54320, 54321, 54322, 54323, 54324]) {
  const failures = [];
  if (!status || typeof status !== "object") return ["Supabase status JSON is malformed"];
  for (const [key, value] of Object.entries(status)) {
    if (typeof value !== "string" || !/(?:url|uri|host|db)/i.test(key)) continue;
    if (/^(?:https?|postgres(?:ql)?):\/\//i.test(value)) {
      try {
        const parsed = new URL(value);
        const host = parsed.hostname;
        if (!['127.0.0.1', 'localhost', '::1'].includes(host)) failures.push(`${key} is not loopback`);
        const port = parsed.port ? Number(parsed.port) : null;
        if (port === null || !allowedPorts.includes(port)) failures.push(`${key} uses unexpected port ${parsed.port || "default"}`);
      } catch { failures.push(`${key} is not a valid local endpoint`); }
    }
  }
  return failures;
}

export function parseDatabaseTestCounts(output) {
  const source = String(output);
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const line of source.split(/\r?\n/)) {
    if (/^not ok\b/i.test(line.trim())) failed += 1;
    else if (/^ok\b/i.test(line.trim())) {
      if (/\#\s*skip\b/i.test(line)) skipped += 1;
      else passed += 1;
    }
  }
  if (passed + failed + skipped === 0) {
    const prove = source.match(/Tests=(\d+).*?Result:\s*(PASS|FAIL)/is);
    if (prove) {
      if (prove[2].toUpperCase() === "PASS") passed = Number(prove[1]);
      else failed = Number(prove[1]);
    }
  }
  return { passed, failed, skipped };
}

export function isArtifactDirectoryOutsideRepository(root, artifactDirectory) {
  if (!artifactDirectory) return true;
  const repository = resolve(root);
  const artifact = resolve(artifactDirectory);
  const fromRepository = relative(repository, artifact);
  return Boolean(fromRepository) && (fromRepository === ".." || fromRepository.startsWith(`..${sep}`));
}
