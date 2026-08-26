import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { phase1HttpGateContract } from "../../scripts/run-phase1-http-gates.mjs";

test("Phase 1 behavioral runner covers the registered JWT and RPC-abuse cases", async () => {
  const registry = JSON.parse(await readFile(new URL("../gates/phase1-security-scenarios.json", import.meta.url), "utf8"));
  const contract = phase1HttpGateContract();
  assert.equal(contract.jwtCases, registry.jwtCases.length);
  assert.equal(contract.rpcAbuseCases, registry.rpcAbuseCases.length);
  assert.equal(contract.directTableCases, registry.roles.length * 4);
  assert.equal(contract.concurrencyCases, registry.concurrencyCases.length);
  assert.equal(contract.storageCases, registry.storageCases.length);
  assert.equal(contract.reconciliationCases, 6);
  assert.equal(contract.rollbackCases, 5);
  assert.deepEqual(contract.finalState, { profilingMode: "off" });
});

test("behavioral execution is confined to the disposable local status values", async () => {
  const source = await readFile(new URL("../../scripts/run-local-database-gates.mjs", import.meta.url), "utf8");
  assert.match(source, /apiUrl: localStatus\.API_URL/);
  assert.match(source, /anonKey: localStatus\.ANON_KEY/);
  assert.match(source, /readCounts: \(\) => readPhase1CountsFromDisposableDatabase\(isolated\)/);
  assert.match(source, /behavioralPhase1: options\.scope === "phase1"/);
  assert.match(source, /--phase1-behavior-only/);
});

test("side-effect counts use a fixed aggregate-only query in the validated disposable container", async () => {
  const [behavioral, runner] = await Promise.all([
    readFile(new URL("../../scripts/run-phase1-http-gates.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/run-local-database-gates.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(behavioral, /a fixed disposable database count reader is required/);
  assert.match(runner, /readPhase1CountsFromDisposableDatabase/);
  assert.match(runner, /supabase_db_\$\{DISPOSABLE_CONFIRMATION\}/);
  assert.doesNotMatch(runner, /SELECT \*/);
  assert.match(behavioral, /anonymous Storage list disclosed object metadata/);
});
