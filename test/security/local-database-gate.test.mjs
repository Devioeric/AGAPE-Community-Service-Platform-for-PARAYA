import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import scopeManifest from "../../supabase/database-gate-scopes.json" with { type: "json" };
import { validateDatabaseGateScopeManifest } from "../../scripts/lib/database-gate-config.mjs";
import {
  assertSuccessfulProcessResult,
  BASELINE_FILE,
  findForbiddenSupabaseLinkMetadata,
  findMissingGateInputs,
  inspectMigrationNames,
  isolatedChildEnvironment,
  isArtifactDirectoryOutsideRepository,
  parseDatabaseTestCounts,
  prepareIsolatedSupabaseProject,
  redactProcessOutput,
  selectMigrationNames,
  validateDisposableCleanupTarget,
  validateDisposableProjectConfig,
  validateInstalledSupabaseCliPackage,
  validateLocalSupabaseStatus,
  validateSupabaseConfig,
} from "../../scripts/lib/local-database-gate.mjs";

test("database gate requires one canonical first migration and rejects unordered SQL", () => {
  assert.deepEqual(inspectMigrationNames([
    BASELINE_FILE,
    "20260816000100_phase0.sql",
    "20260817000100_phase1.sql",
  ]), []);
  const failures = inspectMigrationNames([
    "20260816000100_phase0.sql",
    "legacy_patch.sql",
  ]).join("\n");
  assert.match(failures, /non-timestamped SQL/);
  assert.match(failures, /canonical baseline/);
});

test("database gate rejects duplicate migration timestamps", () => {
  const failures = inspectMigrationNames([
    BASELINE_FILE,
    "20260816000100_first.sql",
    "20260816000100_second.sql",
  ]).join("\n");
  assert.match(failures, /duplicate migration timestamp 20260816000100/);
});

test("database gate selects deterministic Phase 1 and applied-reconciliation cutoffs", () => {
  const names = [
    BASELINE_FILE, "20260816000100_phase0.sql", "20260817000410_phase1.sql",
    "20260818000100_phase2.sql", "legacy.sql",
  ];
  const manifest = structuredClone(scopeManifest);
  manifest.scopes.phase1.migrationNames = names.slice(0, 3);
  manifest.scopes.phase2.migrationNames = names.slice(0, 4);
  assert.deepEqual(selectMigrationNames(names, { scope: "phase1", scopeManifest: manifest }), names.slice(0, 3));
  assert.deepEqual(selectMigrationNames(names, { scope: "reconciliation-applied", appliedVersions: ["20260816000100"], scopeManifest: manifest }), [BASELINE_FILE, "20260816000100_phase0.sql"]);
});

test("database gate redacts local database passwords, JWTs, and key output", () => {
  const fakeSupabaseSecret = ["sb", "secret", "abcdefghijklmnopqrstuvwxyz"].join("_");
  const output = redactProcessOutput([
    "postgresql://postgres:local-password@127.0.0.1:54322/postgres",
    "SERVICE_ROLE_KEY=top-secret",
    "SUPABASE_ACCESS_TOKEN=access-token-value",
    fakeSupabaseSecret,
    "eyJaaaaaaaaaaaaaaaaaaaaaaaa.eyJbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccc",
  ].join("\n"));
  assert.ok(!output.includes(fakeSupabaseSecret));
  assert.doesNotMatch(output, /local-password|top-secret|access-token-value|eyJaaaaaaaa/);
  assert.match(output, /REDACTED/);
});

test("local status secrets stay in memory and are never printed or persisted", async () => {
  const source = await readFile(new URL("../../scripts/run-local-database-gates.mjs", import.meta.url), "utf8");
  assert.match(source, /stdio: \["ignore", "pipe", "ignore"\]/);
  assert.match(source, /Buffer\.concat\(chunks\)\.toString\("utf8"\)/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:SERVICE_ROLE_KEY|SECRET_KEY)/);
  assert.doesNotMatch(source, /writeFile\([^\n]*(?:SERVICE_ROLE_KEY|SECRET_KEY)/);
});

test("database gate strips every remote Supabase credential and forces features off", () => {
  const child = isolatedChildEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: "https://real-project.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    SUPABASE_ACCESS_TOKEN: "access",
    SUPABASE_DB_PASSWORD: "password",
    DATABASE_URL: "postgresql://remote",
    AGAPE_PROPOSALS_V2_ENABLED: "true",
    SAFE_VALUE: "kept",
    Path: "C:\\Windows\\System32",
  });
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "DATABASE_URL"]) {
    assert.equal(child[key], undefined);
  }
  assert.equal(child.AGAPE_PROPOSALS_V2_ENABLED, "false");
  assert.equal(child.SAFE_VALUE, undefined);
  assert.equal(child.Path, "C:\\Windows\\System32");
  assert.equal(child.AGAPE_DB_TEST_ISOLATED, "true");
});

test("database gate rejects any non-loopback Supabase status endpoint", () => {
  assert.deepEqual(validateLocalSupabaseStatus({ API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:x@localhost:54322/postgres" }), []);
  assert.match(validateLocalSupabaseStatus({ API_URL: "https://remote.supabase.co" }).join("\n"), /not loopback/);
  assert.match(validateLocalSupabaseStatus({ API_URL: "http://127.0.0.1:9999" }).join("\n"), /unexpected port/);
});

test("scope manifest locks CLI, PostgreSQL, ports, and explicit Phase scopes", () => {
  assert.deepEqual(validateDatabaseGateScopeManifest(scopeManifest), []);
  const wrongCli = structuredClone(scopeManifest);
  wrongCli.supabaseCliVersion = "2.113.0";
  assert.match(validateDatabaseGateScopeManifest(wrongCli).join("\n"), /CLI version/);
  const wrongPostgres = structuredClone(scopeManifest);
  wrongPostgres.postgresMajorVersion = 15;
  assert.match(validateDatabaseGateScopeManifest(wrongPostgres).join("\n"), /PostgreSQL major/);
  assert.deepEqual(validateInstalledSupabaseCliPackage({ version: "2.114.0" }), []);
  assert.match(validateInstalledSupabaseCliPackage({ version: "2.115.0" }).join("\n"), /exactly 2\.114\.0/);
});

test("source and disposable configs reject wrong IDs, ports, and link metadata", async () => {
  const config = await readFile(resolve("supabase/config.toml"), "utf8");
  assert.deepEqual(validateSupabaseConfig(config, scopeManifest), []);
  const disposable = config.replace('project_id = "agape-local"', 'project_id = "agape-release-gate"');
  assert.deepEqual(validateDisposableProjectConfig(disposable), []);
  assert.match(validateDisposableProjectConfig(disposable.replace("54322", "6543")).join("\n"), /db\.port/);
  assert.match(validateDisposableProjectConfig(`${disposable}\nproject_ref = "remote"`).join("\n"), /linked-project/);
});

test("preflight detects forbidden link state and missing Phase 1 inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "agape-db-gate-preflight-"));
  try {
    await mkdir(join(root, "supabase", ".temp"), { recursive: true });
    await writeFile(join(root, "supabase", ".temp", "project-ref"), "remote", "utf8");
    assert.deepEqual(await findForbiddenSupabaseLinkMetadata(root), ["supabase/.temp"]);
    const missing = await findMissingGateInputs(root, [
      "supabase/tests/database/phase1",
      "supabase/tests/fixtures/release-gate-phase1.sql",
    ]);
    assert.equal(missing.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("process and cleanup guards fail on startup errors, truncation, and unknown targets", () => {
  assert.throws(() => assertSuccessfulProcessResult({ code: 1, truncated: false }, "startup"), /startup failed/);
  assert.throws(() => assertSuccessfulProcessResult({ code: 0, truncated: true }, "database tests"), /truncated/);
  assert.throws(() => validateDisposableCleanupTarget(resolve("supabase")), /refusing to remove/);
  const safe = join(tmpdir(), "agape-release-gate-unit-test");
  assert.equal(validateDisposableCleanupTarget(safe), resolve(safe));
});

test("artifact output is outside Git and TAP counts preserve failed and skipped cases", () => {
  assert.equal(isArtifactDirectoryOutsideRepository(process.cwd(), resolve("private-artifacts")), false);
  assert.equal(isArtifactDirectoryOutsideRepository(process.cwd(), join(tmpdir(), "agape-private-artifacts")), true);
  assert.deepEqual(parseDatabaseTestCounts("ok 1 - allowed\nnot ok 2 - denied\nok 3 - later # SKIP unavailable"), {
    passed: 1, failed: 1, skipped: 1,
  });
});

test("each replay project is fresh and copies only reviewed inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "agape-db-gate-source-"));
  const source = join(root, "supabase");
  await mkdir(join(source, "migrations"), { recursive: true });
  await mkdir(join(source, "tests", "selected"), { recursive: true });
  await mkdir(join(source, "tests", "excluded"), { recursive: true });
  try {
    await writeFile(join(source, "config.toml"), await readFile(resolve("supabase/config.toml"), "utf8"), "utf8");
    await writeFile(join(source, "migrations", BASELINE_FILE), "select 1;", "utf8");
    await writeFile(join(source, "migrations", "20260818000100_excluded.sql"), "select 2;", "utf8");
    await writeFile(join(source, "tests", "selected", "case.sql"), "select 1;", "utf8");
    await writeFile(join(source, "tests", "excluded", "case.sql"), "select 2;", "utf8");
    const first = await prepareIsolatedSupabaseProject(root, {
      migrationNames: [BASELINE_FILE], copyPaths: ["tests/selected"],
    });
    const second = await prepareIsolatedSupabaseProject(root, {
      migrationNames: [BASELINE_FILE], copyPaths: ["tests/selected"],
    });
    try {
      assert.notEqual(first.workspace, second.workspace);
      assert.equal((await readFile(join(first.workspace, "supabase", "tests", "selected", "case.sql"), "utf8")).trim(), "select 1;");
      await assert.rejects(readFile(join(first.workspace, "supabase", "tests", "excluded", "case.sql"), "utf8"));
      await assert.rejects(readFile(join(first.workspace, "supabase", "migrations", "20260818000100_excluded.sql"), "utf8"));
      assert.match(await readFile(first.configPath, "utf8"), /project_id = "agape-release-gate"/);
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("database gate source separates reviewed synthetic and legacy seed replays", async () => {
  const source = await readFile(resolve("scripts/run-local-database-gates.mjs"), "utf8");
  assert.deepEqual(scopeManifest.scopes.phase1.fixtureSeedPaths, ["tests/fixtures/release-gate-phase1.sql"]);
  assert.deepEqual(scopeManifest.scopes.phase2.fixtureSeedPaths, [
    "tests/fixtures/release-gate-phase1.sql",
    "tests/fixtures/release-gate-phase2-supplement.sql",
  ]);
  assert.match(source, /async function newIsolatedProject/);
  assert.match(source, /const isolated = await newIsolatedProject\(\)/);
  assert.match(source, /legacy development seed compatibility check/);
  assert.match(source, /--legacy-seed-only/);
  assert.match(source, /This diagnostic is not release evidence by itself/);
  assert.match(source, /db", "reset", "--local", "--no-seed"/);
  assert.match(source, /--candidate-mode/);
  assert.match(source, /options\.candidateMode/);
  assert.equal(scopeManifest.scopes.phase1.migrationNames.at(-1), "20260818000920_phase1_invitation_completion_boundary.sql");
  assert.equal(scopeManifest.scopes.phase2.migrationNames.at(-1), "20260818000940_phase2_beneficiary_evidence_options.sql");
});

test("database gate can diagnose a reviewed phase fixture without claiming replay evidence", async () => {
  const source = await readFile(new URL("../../scripts/run-local-database-gates.mjs", import.meta.url), "utf8");
  assert.match(source, /--fixture-only/);
  assert.match(source, /synthetic fixture diagnostic passed\. This diagnostic is not release evidence by itself/);
});

test("release fixtures are phase-split, synthetic-only, and preserve disabled runtime defaults", async () => {
  const phase1 = await readFile(resolve("supabase/tests/fixtures/release-gate-phase1.sql"), "utf8");
  const phase2 = await readFile(resolve("supabase/tests/fixtures/release-gate-phase2-supplement.sql"), "utf8");
  const emails = Array.from(`${phase1}\n${phase2}`.matchAll(/'([^']+@[^']+)'/g), (match) => match[1]);
  assert.ok(emails.length >= 26);
  assert.ok(emails.every((email) => email.endsWith("@release-gate.invalid")));
  assert.doesNotMatch(phase1, /phase2_|partner_entities|proposal_v2_profiles/i);
  assert.doesNotMatch(`${phase1}\n${phase2}`, /SET\s+mode\s*=\s*'(?:synthetic|live)'/i);
  assert.match(phase1, /SET mode='off'/);
  assert.match(phase2, /write_authority='v1'/);
  assert.match(phase2, /data_mode='synthetic'/);
});
