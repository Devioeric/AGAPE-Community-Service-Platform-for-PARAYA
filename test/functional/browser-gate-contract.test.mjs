import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { phase1BrowserGateContract } from "../../scripts/run-phase1-browser-gates.mjs";
import { phase2BrowserGateContract } from "../../scripts/run-phase2-browser-gates.mjs";

test("browser gate contracts cover authenticated workflows and the complete role matrix", async () => {
  const phase1 = phase1BrowserGateContract();
  const phase2 = phase2BrowserGateContract();
  assert.deepEqual(phase1, {
    schema: "agape.phase1-browser-gates.v2",
    cases: 10,
    aiRequests: 1,
    workers: 1,
    finalState: { profilingMode: "off" },
  });
  assert.deepEqual(phase2, {
    schema: "agape.phase2-browser-gates.v3",
    cases: 26,
    aiRequests: 3,
    finalState: {
      phase2Modes: "off",
      recommendationAutomation: "off",
      partnerMutationAuthority: "v1",
      proposalMutationAuthority: "v1",
    },
  });

  const roleSpec = await readFile("e2e/role-surface-access.spec.ts", "utf8");
  assert.equal((roleSpec.match(/test\(`\$\{role\}/g) ?? []).length, 1);
  assert.match(roleSpec, /for \(const \[role, surface\] of Object\.entries\(ROLE_SURFACES\)\)/);
  assert.match(roleSpec, /for \(const account of \["pending", "inactive", "suspended"\]\)/);
});
