import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspacePath = "src/components/profiling/ProfilingWorkspace.tsx";
const panelsPath = "src/components/profiling/ProfilingRolePanels.tsx";

test("profiling uses capability-specific role panels without raw JSON workflow output", async () => {
  const [workspace, panels] = await Promise.all([readFile(workspacePath, "utf8"), readFile(panelsPath, "utf8")]);
  assert.match(workspace, /ResearcherOperationsPanel/);
  assert.match(workspace, /SecretaryReviewPanel/);
  assert.match(workspace, /ProfilingAggregatePanel/);
  assert.doesNotMatch(workspace, /JSON\.stringify\(aggregate/);
  assert.doesNotMatch(workspace, /JSON\.stringify\(\{ household: detail/);
  assert.doesNotMatch(workspace, /window\.prompt/);
  assert.match(panels, /data-testid="researcher-operations"/);
  assert.match(panels, /data-testid="secretary-detail-review"/);
});

test("Researcher controls call the existing protected setup and correction routes", async () => {
  const panels = await readFile(panelsPath, "utf8");
  for (const route of [
    "/api/profiling/configuration/prefix",
    "/api/profiling/sitios",
    "/api/profiling/cycles",
    "/api/profiling/sample-register",
    "/api/profiling/sample-register/replacement",
    "/api/profiling/lifecycle",
  ]) assert.match(panels, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(panels, /expected_version: Number\(lifecycle\.expectedVersion\)/);
  assert.match(panels, /target_entity_id: lifecycle\.targetId \|\| null/);
});

test("Secretary return requires an entered reason and approval follows detail review", async () => {
  const panels = await readFile(panelsPath, "utf8");
  const workspace = await readFile(workspacePath, "utf8");
  assert.match(panels, /disabled=\{reason\.trim\(\)\.length < 3\}/);
  assert.match(panels, /onDecision\("approve"\)/);
  assert.match(workspace, /submission\.status === "pending"/);
  assert.match(workspace, /openReview\(submission\.id\)/);
});
