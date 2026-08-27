import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { phase2BrowserGateContract } from "../../scripts/run-phase2-browser-gates.mjs";
import { phase2HttpGateContract } from "../../scripts/run-phase2-http-gates.mjs";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Phase 2 executable registry is complete and bound to its runner", async () => {
  const registry = JSON.parse(await read("test/gates/phase2-security-scenarios.json"));
  const contract = phase2HttpGateContract(registry);
  assert.equal(contract.cases, 83);
  assert.deepEqual(registry.components, ["partners", "historical_programs", "proposals", "program_finance", "external_contact_email"]);
  assert.equal(new Set(Object.values(registry).filter(Array.isArray).flat()).size,
    Object.values(registry).filter(Array.isArray).flat().length, "scenario identifiers must be globally unique");
  assert.deepEqual(contract.finalState, { phase2Modes: "off", partnerMutationAuthority: "v1", proposalMutationAuthority: "v1" });
});

test("database harness executes Phase 2 behavior and browser gates only in the disposable scope", async () => {
  const harness = await read("scripts/run-local-database-gates.mjs");
  assert.match(harness, /--phase2-behavior-only/);
  assert.match(harness, /--phase2-e2e-only/);
  assert.match(harness, /runPhase2HttpGates/);
  assert.match(harness, /runPhase2BrowserGates/);
  assert.match(harness, /readPhase2CountsFromDisposableDatabase/);
  assert.match(harness, /result\.finalState\?\.phase2Modes !== "off"/);
  assert.equal(phase2BrowserGateContract().cases, 9);
  assert.equal(phase2BrowserGateContract().aiRequests, 3);
});

test("forward correction locks renewals and keeps reminders and requeues mode-bound", async () => {
  const migration = await read("supabase/migrations/20260818000900_phase2_executable_gate_corrections.sql");
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('partner-term:'/);
  assert.match(migration, /phase2_assert_runtime\('external_contact_email',partner_id\)/);
  assert.match(migration, /p\.data_mode=partner_mode/);
  assert.match(migration, /status_email_opt_in/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase2_generate_renewal_reminders\(\) FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /UPDATE public\.phase2_component_runtime SET mode='off'/);
  assert.match(migration, /UPDATE public\.phase2_cutover_state SET write_authority='v1'/);
});

test("Captain and Secretary historical capability parity remains aggregate-only", async () => {
  const [capabilities, migration, history] = await Promise.all([
    read("src/lib/auth/capabilities.ts"),
    read("supabase/migrations/20260818000900_phase2_executable_gate_corrections.sql"),
    read("src/components/phase2/HistoricalOperations.tsx"),
  ]);
  assert.match(capabilities, /barangay_captain:[\s\S]*"historical_program\.read"/);
  assert.match(capabilities, /barangay_secretary:[\s\S]*"historical_program\.read"/);
  assert.match(migration, /WHEN p_role IN\('barangay_captain','barangay_secretary'\) THEN p_capability='historical_program\.read'/);
  assert.match(history, /canDetail/);
  assert.match(history, /canDetail && <Panel title="Historical review queue"/);
});

test("AI budget context contains status counts and no financial descriptions", async () => {
  const router = await read("src/lib/ai/chatbot-query-router.ts");
  const browser = await read("scripts/run-phase2-browser-gates.mjs");
  assert.match(router, /\.select\("approval_status"\)/);
  assert.match(router, /Budget review summary/);
  assert.doesNotMatch(router, /\.select\("item, amount, approval_status/);
  assert.match(browser, /synthetic-receipt\.pdf/);
  assert.match(browser, /readWorkflowFingerprint/);
  assert.match(browser, /phase2Modes: "off"/);
});
