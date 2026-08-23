import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePhase1SecurityScenarios } from "../../scripts/validate-phase1-security-scenarios.mjs";

test("Phase 1 executable suite definition covers every role, state, and mandatory boundary", async () => {
  const value = JSON.parse(await readFile("test/gates/phase1-security-scenarios.json", "utf8"));
  const result = validatePhase1SecurityScenarios(value);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.counts, { jwt: 11, rpcAbuse: 16, concurrency: 10, storage: 15 });
});

test("Phase 1 catalog tests enumerate application tables and revoke public execution", async () => {
  const sql = await readFile("supabase/tests/database/phase1/01_catalog_security.sql", "utf8");
  assert.match(sql, /SELECT plan\(10\)/);
  assert.match(sql, /phase1_application_tables/);
  assert.match(sql, /NOT c\.relrowsecurity/);
  assert.match(sql, /phase1_permission_module_for_table/);
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.match(sql, /grantee=0/);
  assert.match(sql, /prosecdef/);
});

test("seeded pgTAP plan counts match their assertions", async () => {
  for (const path of ["supabase/tests/database/phase1/01_catalog_security.sql", "supabase/tests/seeded/phase1/01_fixture_security_invariants.sql"]) {
    const sql = await readFile(path, "utf8");
    const plan = Number(sql.match(/SELECT plan\((\d+)\)/)?.[1]);
    const assertions = [...sql.matchAll(/SELECT\s+(?:ok|is)\(/g)].length;
    assert.equal(assertions, plan, path);
  }
});
