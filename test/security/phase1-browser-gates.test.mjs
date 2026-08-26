import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { phase1BrowserGateContract } from "../../scripts/run-phase1-browser-gates.mjs";

test("Phase 1 browser contract is authenticated, serial, synthetic, and restores off state", async () => {
  const [runner, spec, orchestrator] = await Promise.all([
    readFile(new URL("../../scripts/run-phase1-browser-gates.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../e2e/phase1-authenticated.spec.ts", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/run-local-database-gates.mjs", import.meta.url), "utf8"),
  ]);
  const contract = phase1BrowserGateContract();
  assert.deepEqual(contract, { schema: "agape.phase1-browser-gates.v1", cases: 8, aiRequests: 2, workers: 1, finalState: { profilingMode: "off" } });
  assert.match(runner, /AGAPE_PROFILING_V2_ENABLED: "true"/);
  assert.match(runner, /p_mode: "synthetic"/);
  assert.match(runner, /p_mode: "off"/);
  assert.match(runner, /--workers=1/);
  assert.match(runner, /e2e\/phase1-authenticated\.spec\.ts/);
  assert.match(runner, /assertPrivateAiPayloads/);
  assert.match(runner, /AI payload leaked prohibited profiling material/);
  assert.match(spec, /signInWithPassword|Sign In/);
  assert.match(spec, /Researcher can operate setup/);
  assert.match(spec, /Secretary must open complete detail/);
  assert.match(spec, /Captain can view approved aggregate detail/);
  assert.match(spec, /System Admin loads account-provisioning options without operational partnership access/);
  assert.match(spec, /requestedPaths\)\.not\.toContain\("\/api\/partnerships"\)/);
  assert.match(orchestrator, /--phase1-e2e-only/);
  assert.match(orchestrator, /serviceRoleKey: localStatus\.SERVICE_ROLE_KEY \?\? localStatus\.SECRET_KEY/);
  assert.match(orchestrator, /readWorkflowFingerprint: \(\) => readWorkflowFingerprintFromDisposableDatabase\(isolated\)/);
});

test("authenticated browser spec is absent from ambient dark-launch execution", async () => {
  const spec = await readFile(new URL("../../e2e/phase1-authenticated.spec.ts", import.meta.url), "utf8");
  assert.match(spec, /if \(process\.env\.AGAPE_PHASE1_E2E === "true"\)/);
  assert.doesNotMatch(spec, /test\.skip/);
});
