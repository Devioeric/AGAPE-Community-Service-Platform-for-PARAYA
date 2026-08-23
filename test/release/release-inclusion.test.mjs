import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyReleasePath,
  applyOwnerApprovals,
  parseGitPorcelainZ,
  scanFileForSecretRuleIds,
  summarizeManifestEntries,
} from "../../scripts/lib/release-inclusion.mjs";

test("release inclusion classifies repository, private, generated, and review paths", () => {
  assert.equal(classifyReleasePath("src/app/page.tsx").classification, "include");
  assert.equal(classifyReleasePath(".env.local").classification, "exclude-private");
  assert.equal(classifyReleasePath("test-results/result.json").classification, "exclude-generated");
  assert.equal(classifyReleasePath("ProcessFiles Paraya/source.pdf").classification, "ambiguous-needs-owner-review");
  assert.equal(classifyReleasePath("AGAPE-ERD.drawio").classification, "ambiguous-needs-owner-review");
});

test("git porcelain parser preserves spaces and tracked state", () => {
  const entries = parseGitPorcelainZ(" M package.json\0?? ProcessFiles Paraya/source.pdf\0");
  assert.deepEqual(entries, [
    { path: "package.json", state: " M", tracked: true },
    { path: "ProcessFiles Paraya/source.pdf", state: "??", tracked: false },
  ]);
});

test("manifest summary counts classifications and secret rules", () => {
  const summary = summarizeManifestEntries([
    { classification: "include", secretRuleIds: [], acknowledgedSecretRuleIds: [] },
    { classification: "ambiguous-needs-owner-review", secretRuleIds: ["test-rule"], acknowledgedSecretRuleIds: [] },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.include, 1);
  assert.equal(summary["ambiguous-needs-owner-review"], 1);
  assert.equal(summary.secretFindings, 1);
});

test("owner approvals include reviewed artifacts and acknowledge only exact fixture rules", () => {
  const result = applyOwnerApprovals({
    path: "ProcessFiles Paraya/diagram.drawio",
    classification: "ambiguous-needs-owner-review",
    reason: "review",
    secretRuleIds: ["fixture-rule", "unexpected-rule"],
  }, {
    approvedIncludePrefixes: ["ProcessFiles Paraya/"],
    acknowledgedSyntheticSecretFixtures: {
      "ProcessFiles Paraya/diagram.drawio": ["fixture-rule"],
    },
  });
  assert.equal(result.classification, "include");
  assert.deepEqual(result.acknowledgedSecretRuleIds, ["fixture-rule"]);
  assert.deepEqual(result.secretRuleIds, ["unexpected-rule"]);
});

test("empty service-role placeholders do not consume the following line", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agape-release-inclusion-"));
  const path = join(directory, ".env.example");
  try {
    await writeFile(path, "SUPABASE_SERVICE_ROLE_KEY=\nAGAPE_PROFILING_V2_ENABLED=false\n", "utf8");
    assert.deepEqual(await scanFileForSecretRuleIds(path, ".env.example"), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
