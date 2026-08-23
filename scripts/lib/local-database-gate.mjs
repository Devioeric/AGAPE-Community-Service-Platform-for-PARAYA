import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

export const BASELINE_FILE = "20260815000000_pre_phase0_baseline.sql";
export const DISPOSABLE_CONFIRMATION = "agape-release-gate";
export const PHASE_FLAGS = [
  "AGAPE_PROFILING_V2_ENABLED",
  "AGAPE_PARTNER_REGISTRY_V2_ENABLED",
  "AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED",
  "AGAPE_PROPOSALS_V2_ENABLED",
  "AGAPE_PROGRAM_FINANCE_V2_ENABLED",
  "AGAPE_EXTERNAL_CONTACT_EMAIL_ENABLED",
];

const TIMESTAMPED_MIGRATION = /^(\d{14})_[a-z0-9_]+\.sql$/;

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
    .replace(/\b((?:SERVICE_ROLE|ANON|JWT)_?(?:KEY|SECRET))\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}

const REMOTE_ENVIRONMENT_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "DATABASE_URL", "POSTGRES_URL",
  "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING",
];

export function isolatedChildEnvironment(env = process.env) {
  const result = { ...env };
  for (const key of REMOTE_ENVIRONMENT_KEYS) delete result[key];
  for (const flag of PHASE_FLAGS) result[flag] = "false";
  result.AGAPE_DB_TEST_ISOLATED = "true";
  return result;
}

export async function prepareIsolatedSupabaseProject(root) {
  const privateRoot = await mkdtemp(join(tmpdir(), "agape-release-gate-"));
  const workspace = join(privateRoot, "workspace");
  const source = join(root, "supabase");
  const target = join(workspace, "supabase");
  await mkdir(target, { recursive: true });
  await cp(join(source, "migrations"), join(target, "migrations"), { recursive: true });
  await cp(join(source, "tests"), join(target, "tests"), { recursive: true });
  await cp(join(source, "seed.sql"), join(target, "seed.sql"));

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
      const resolved = resolve(privateRoot);
      const temp = `${resolve(tmpdir())}${sep}`;
      if (!resolved.startsWith(temp) || !basename(resolved).startsWith("agape-release-gate-")) {
        throw new Error("refusing to remove a directory outside the AGAPE release-gate temp root");
      }
      await rm(resolved, { recursive: true, force: true });
    },
  };
}

export async function collectStaticPreflightFailures(root, env = process.env) {
  const failures = [];
  const migrationDir = resolve(root, "supabase", "migrations");
  const configPath = resolve(root, "supabase", "config.toml");
  const cliPath = resolve(root, "node_modules", "supabase", "dist", "supabase.js");
  const requiredGateFiles = [
    resolve(root, "supabase", "seed.sql"),
    resolve(root, "supabase", "tests", "fixtures", "release-gate-synthetic.sql"),
    resolve(root, "supabase", "tests", "database", "00_catalog_grants_rls.sql"),
    resolve(root, "supabase", "tests", "database", "01_synthetic_capabilities_runtime.sql"),
    resolve(root, "supabase", "tests", "database", "02_storage_boundaries.sql"),
    resolve(root, "supabase", "tests", "seeded", "00_release_fixture_integrity.sql"),
  ];

  let migrationNames = [];
  try {
    migrationNames = await readdir(migrationDir);
    failures.push(...inspectMigrationNames(migrationNames));
  } catch {
    failures.push("supabase/migrations is missing or unreadable");
  }

  if (migrationNames.includes(BASELINE_FILE)) {
    try {
      const baseline = await readFile(resolve(migrationDir, BASELINE_FILE), "utf8");
      if (baseline.trim().length < 1_000) failures.push("canonical baseline is unexpectedly small and is not accepted as verified");
    } catch {
      failures.push("canonical baseline cannot be read");
    }
  }

  try {
    const config = await readFile(configPath, "utf8");
    if (!/^project_id\s*=\s*"agape-local"\s*$/m.test(config)) failures.push("Supabase project_id must be exactly agape-local");
    if (!/^port\s*=\s*54322\s*$/m.test(config)) failures.push("local database port must remain the dedicated 54322 test port");
  } catch {
    failures.push("supabase/config.toml is missing or unreadable");
  }

  try {
    await access(cliPath, fsConstants.R_OK);
  } catch {
    failures.push("repository-local Supabase CLI is missing; run npm ci before database gates");
  }

  for (const path of requiredGateFiles) {
    try { await access(path, fsConstants.R_OK); }
    catch { failures.push(`required database-gate input is missing: ${path.slice(root.length + 1)}`); }
  }

  for (const flag of PHASE_FLAGS) {
    if (env[flag] === "true") failures.push(`${flag} must be false during disposable replay`);
  }

  return failures;
}

export function runProcess(command, args, { cwd, env = process.env, timeoutMs = 180_000 } = {}) {
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
