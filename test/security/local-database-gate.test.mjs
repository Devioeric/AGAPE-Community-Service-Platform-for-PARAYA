import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  BASELINE_FILE,
  inspectMigrationNames,
  isolatedChildEnvironment,
  redactProcessOutput,
  selectMigrationNames,
  validateLocalSupabaseStatus,
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
  assert.deepEqual(selectMigrationNames(names, { scope: "phase1" }), names.slice(0, 3));
  assert.deepEqual(selectMigrationNames(names, { scope: "reconciliation-applied", appliedVersions: ["20260816000100"] }), [BASELINE_FILE, "20260816000100_phase0.sql"]);
});

test("database gate redacts local database passwords, JWTs, and key output", () => {
  const output = redactProcessOutput([
    "postgresql://postgres:local-password@127.0.0.1:54322/postgres",
    "SERVICE_ROLE_KEY=top-secret",
    "eyJaaaaaaaaaaaaaaaaaaaaaaaa.eyJbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccc",
  ].join("\n"));
  assert.doesNotMatch(output, /local-password|top-secret|eyJaaaaaaaa/);
  assert.match(output, /REDACTED/);
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
  });
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "DATABASE_URL"]) {
    assert.equal(child[key], undefined);
  }
  assert.equal(child.AGAPE_PROPOSALS_V2_ENABLED, "false");
  assert.equal(child.SAFE_VALUE, "kept");
  assert.equal(child.AGAPE_DB_TEST_ISOLATED, "true");
});

test("database gate rejects any non-loopback Supabase status endpoint", () => {
  assert.deepEqual(validateLocalSupabaseStatus({ API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:x@localhost:54322/postgres" }), []);
  assert.match(validateLocalSupabaseStatus({ API_URL: "https://remote.supabase.co" }).join("\n"), /not loopback/);
});

test("database gate source separates reviewed synthetic and legacy seed replays", async () => {
  const source = await readFile(resolve("scripts/run-local-database-gates.mjs"), "utf8");
  assert.match(source, /release-gate-synthetic\.sql/);
  assert.match(source, /legacy development seed compatibility check/);
  assert.match(source, /db", "reset", "--local", "--no-seed"/);
});

test("release fixture is synthetic-only and preserves disabled runtime defaults", async () => {
  const source = await readFile(resolve("supabase/tests/fixtures/release-gate-synthetic.sql"), "utf8");
  const emails = Array.from(source.matchAll(/'([^']+@[^']+)'/g), (match) => match[1]);
  assert.ok(emails.length >= 17);
  assert.ok(emails.every((email) => email.endsWith("@release-gate.invalid")));
  assert.doesNotMatch(source, /SET\s+mode\s*=\s*'(?:synthetic|live)'/i);
  assert.match(source, /SET mode='off'/);
  assert.match(source, /write_authority='v1'/);
});
