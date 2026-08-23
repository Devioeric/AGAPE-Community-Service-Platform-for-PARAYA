import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  collectStaticPreflightFailures,
  DISPOSABLE_CONFIRMATION,
  dockerEngineFailure,
  isolatedChildEnvironment,
  prepareIsolatedSupabaseProject,
  runProcess,
} from "./lib/local-database-gate.mjs";
import { compareSchemaDumps } from "./lib/migration-governance.mjs";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "node_modules", "supabase", "dist", "supabase.js");
const allowedModes = new Set(["--preflight", "--replay-only", "--all"]);
const mode = process.argv[2] ?? "--all";

if (!allowedModes.has(mode) || process.argv.length > 3) {
  console.error("Usage: node scripts/run-local-database-gates.mjs [--preflight|--replay-only|--all]");
  process.exit(2);
}

const failures = await collectStaticPreflightFailures(root);
const dockerFailure = await dockerEngineFailure(root);
if (dockerFailure) failures.push(dockerFailure);

if (mode !== "--preflight" && process.env.AGAPE_DB_TEST_CONFIRM_DISPOSABLE !== DISPOSABLE_CONFIRMATION) {
  failures.push(`set AGAPE_DB_TEST_CONFIRM_DISPOSABLE=${DISPOSABLE_CONFIRMATION} to authorize destruction of only the local ${DISPOSABLE_CONFIRMATION} database`);
}

if (failures.length) {
  console.error("Disposable database gate prerequisites failed:\n- " + failures.join("\n- "));
  console.error("No migration, seed, database reset, or evidence write was attempted.");
  process.exit(1);
}

if (mode === "--preflight") {
  console.log("Disposable database gate prerequisites are available. No database was changed.");
  process.exit(0);
}

const cliEnv = isolatedChildEnvironment();
const isolated = await prepareIsolatedSupabaseProject(root);

async function supabase(args, label, timeoutMs = 240_000) {
  console.log(label);
  const result = await runProcess(process.execPath, [cli, ...args], { cwd: isolated.workspace, env: cliEnv, timeoutMs });
  if (result.code !== 0 || result.truncated) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed${detail ? `:\n${detail}` : ""}${result.truncated ? "\n[output truncated]" : ""}`);
  }
  if (args[0] === "test" && result.stdout.trim()) process.stdout.write(result.stdout);
}

async function stopStack() {
  const stopped = await runProcess(process.execPath, [cli, "stop", "--no-backup"], {
    cwd: isolated.workspace, env: cliEnv, timeoutMs: 120_000,
  }).catch(() => null);
  if (!stopped || stopped.code !== 0 || stopped.truncated) throw new Error(`The disposable ${DISPOSABLE_CONFIRMATION} stack could not be stopped safely.`);
}

async function replayCycle(number, runAssertions) {
  let attemptedStart = false;
  const dumpPath = join(isolated.privateRoot, `replay-${number}.sql`);
  try {
    attemptedStart = true;
    await supabase(["start"], `Starting clean disposable replay ${number}`);
    await supabase(["db", "reset", "--local", "--no-seed"], `Replaying canonical migrations for cycle ${number}`, 360_000);
    if (runAssertions) {
      await supabase(["test", "db", "supabase/tests/database", "--local"], `Running database assertions for cycle ${number}`, 240_000);
    }
    await supabase(["db", "dump", "--local", "--schema", "public", "--file", dumpPath], `Capturing schema-only replay ${number}`, 240_000);
    return await readFile(dumpPath, "utf8");
  } finally {
    if (attemptedStart) await stopStack();
  }
}

async function configureSeed(sqlPath) {
  let config = await readFile(isolated.configPath, "utf8");
  config = config
    .replace(/(\[db\.seed\][\s\S]*?^enabled\s*=\s*)(?:true|false)\s*$/m, "$1true")
    .replace(/(\[db\.seed\][\s\S]*?^sql_paths\s*=\s*)\[[^\r\n]*\]/m, `$1["${sqlPath}"]`);
  if (!/\[db\.seed\][\s\S]*?^enabled\s*=\s*true\s*$/m.test(config)) throw new Error("failed to enable only the selected disposable seed");
  await writeFile(isolated.configPath, config, "utf8");
}

async function seededCompatibilityCycle({ label, seedPath, assertions = null }) {
  let attemptedStart = false;
  try {
    await configureSeed(seedPath);
    attemptedStart = true;
    await supabase(["start"], `Starting ${label}`);
    await supabase(["db", "reset", "--local"], `Replaying migrations with ${label}`, 360_000);
    if (assertions) await supabase(["test", "db", assertions, "--local"], `Validating ${label}`, 240_000);
  } finally {
    if (attemptedStart) await stopStack();
  }
}

try {
  const first = await replayCycle(1, false);
  const second = await replayCycle(2, mode === "--all");
  const comparison = compareSchemaDumps(first, second);
  if (!comparison.equivalent) throw new Error(`clean replay schemas differ at normalized line ${comparison.firstDifferentLine ?? "unknown"}`);
  if (mode === "--all") {
    await seededCompatibilityCycle({
      label: "reviewed synthetic release fixture",
      seedPath: "./tests/fixtures/release-gate-synthetic.sql",
      assertions: "supabase/tests/seeded",
    });
    await seededCompatibilityCycle({
      label: "legacy development seed compatibility check",
      seedPath: "./seed.sql",
    });
  }
  console.log(`Clean replay SHA-256: ${comparison.authoritative.sha256}`);
  console.log(mode === "--all"
    ? "Two disposable replays and database assertions passed. This console result is not release evidence by itself."
    : "Two disposable migration replays passed. Catalog/RLS assertions were intentionally not run.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await isolated.cleanup().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
