import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_BASELINE_NAME,
  analyzeMigrationEntries,
  classifyMigrationName,
  compareSchemaDumps,
  extractCombinedMembers,
  extractUsersRoleConstraintSets,
  normalizeSchemaDump,
} from "../../scripts/lib/migration-governance.mjs";

function entry(name, sql = "SELECT 1;", sha256 = "fixture") {
  return { name, sql, sha256, ...classifyMigrationName(name) };
}

test("migration names are classified without inferring an order for legacy SQL", () => {
  assert.deepEqual(classifyMigrationName("20260816000100_phase0_guard.sql"), {
    classification: "timestamped", version: "20260816000100", slug: "phase0_guard",
  });
  assert.equal(classifyMigrationName(CANONICAL_BASELINE_NAME).classification, "canonical-baseline");
  assert.equal(classifyMigrationName("role_expansion.sql").classification, "legacy-unordered");
  assert.equal(classifyMigrationName("_COMBINED_pending.sql").classification, "legacy-combined");
});

test("combined members and contradictory role constraints are detected deterministically", () => {
  const combined = "-- ## alpha.sql\nSELECT 1;\n-- ## beta.sql\nSELECT 2;\n";
  assert.deepEqual(extractCombinedMembers(combined), ["alpha.sql", "beta.sql"]);
  const roles = extractUsersRoleConstraintSets("ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','volunteer')); ");
  assert.deepEqual(roles, [["admin", "volunteer"]]);

  const report = analyzeMigrationEntries([
    entry("_COMBINED_pending.sql", combined), entry("alpha.sql"), entry("beta.sql"),
    entry("first_roles.sql", "ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin'));"),
    entry("second_roles.sql", "ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','volunteer'));"),
  ]);
  const codes = report.hazards.map((item) => item.code);
  assert.ok(codes.includes("CANONICAL_BASELINE_MISSING"));
  assert.ok(codes.includes("COMBINED_SCRIPT_OVERLAPS_INDIVIDUAL_INPUTS"));
  assert.ok(codes.includes("CONTRADICTORY_USERS_ROLE_CONSTRAINTS"));
  assert.equal(report.ready, false);
});

test("ledger comparison distinguishes applied gaps from later pending migrations", () => {
  const report = analyzeMigrationEntries([
    entry(CANONICAL_BASELINE_NAME, "CREATE TABLE public.users (id uuid);"),
    entry("20260816000100_first.sql"),
    entry("20260816000200_second.sql"),
    entry("20260816000300_pending.sql"),
  ], { ledgerVersions: ["20260816000200"] });
  assert.deepEqual(report.ledger.gapsBeforeLatest, ["20260816000100"]);
  assert.deepEqual(report.ledger.pendingAfterLatest, ["20260816000300"]);
  assert.ok(report.hazards.some((item) => item.code === "LOCAL_LEDGER_GAPS"));
});

test("schema comparison ignores only known pg_dump noise and remains fail-closed", () => {
  const authoritative = "-- Dumped from database version 15.4\n-- Started on 2026-08-17 10:00:00\nCREATE TABLE public.users (id uuid);\n";
  const equivalentReplay = "-- Dumped from database version 15.5\r\n-- Started on 2026-08-18 11:00:00\r\nCREATE TABLE public.users (id uuid);\r\n";
  assert.equal(compareSchemaDumps(authoritative, equivalentReplay).equivalent, true);
  assert.equal(normalizeSchemaDump(authoritative), normalizeSchemaDump(equivalentReplay));

  const changedReplay = "CREATE TABLE public.users (id text);\n";
  const mismatch = compareSchemaDumps(authoritative, changedReplay);
  assert.equal(mismatch.equivalent, false);
  assert.equal(mismatch.firstDifferentLine, 1);

  const dataBearing = "CREATE TABLE public.users (id uuid);\nCOPY public.users (id) FROM stdin;\nvalue\n\\.\n";
  assert.equal(compareSchemaDumps(dataBearing, dataBearing).equivalent, false);

  const credentialBearing = "CREATE TABLE public.users (id uuid);\n-- DATABASE_URL=postgresql://operator:secret@db.invalid/postgres\n";
  const rejected = compareSchemaDumps(credentialBearing, credentialBearing);
  assert.equal(rejected.equivalent, false);
  assert.match(rejected.authoritative.problems.join("\n"), /connection string|credential/i);
});
