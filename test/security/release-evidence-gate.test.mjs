import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateDisabledFeatureConfiguration, validateEvidenceContent } from "../../scripts/lib/release-evidence.mjs";

const revision = "a".repeat(40);
const approved = `Evidence-Status: APPROVED
Evidence-Result: PASS
Environment: disposable-clone
Executed-Date: 2026-08-17
Operator: Maria Santos (Database Operator)
Reviewer: Jose Reyes (Security Reviewer)
Release-Revision: ${revision}
Evidence-Reference: PRIVATE-EVIDENCE-AGAPE-2042
Artifact-SHA256: ${"9".repeat(64)}
`;

test("approved evidence requires independent, current, revision-bound review", () => {
  const result = validateEvidenceContent(approved, { expectedRevision: revision, now: new Date("2026-08-17T12:00:00Z") });
  assert.equal(result.valid, true, result.failures.join("; "));
});

test("templates, placeholders, stale dates, and mismatched revisions fail closed", () => {
  const content = approved
    .replace("APPROVED", "DRAFT")
    .replace("2026-08-17", "2025-01-01")
    .replace(`Release-Revision: ${revision}`, "Release-Revision: bbbbbbb")
    .replace("PRIVATE-EVIDENCE-AGAPE-2042", "TBD");
  const result = validateEvidenceContent(content, { expectedRevision: revision, now: new Date("2026-08-17T12:00:00Z") });
  assert.equal(result.valid, false);
  assert.match(result.failures.join("\n"), /APPROVED|expired|match|placeholder/i);
});

test("baseline evidence is bound to the canonical file digest and zero differences", () => {
  const digest = "c".repeat(64);
  const result = validateEvidenceContent(`${approved}
Baseline-File: 20260815000000_pre_phase0_baseline.sql
Baseline-SHA256: ${digest}
Authoritative-Dump-SHA256: ${"d".repeat(64)}
Replay-Dump-SHA256: ${"e".repeat(64)}
Migration-Ledger-SHA256: ${"f".repeat(64)}
Unexplained-Differences: 0
Object-Count: 42
PostgreSQL-Version: 15.8
Supabase-CLI-Version: 2.114.0
`, { expectedRevision: revision, now: new Date("2026-08-17T12:00:00Z"), baseline: { file: "20260815000000_pre_phase0_baseline.sql", sha256: digest } });
  assert.equal(result.valid, true, result.failures.join("; "));
});

test("release configuration requires explicit false values without exposing other env values", async () => {
  const root = await mkdtemp(join(tmpdir(), "agape-release-flags-"));
  await writeFile(join(root, ".env.example"), "AGAPE_PROFILING_V2_ENABLED=false\nPRIVATE_VALUE=do-not-report\n");
  await writeFile(join(root, ".env.local"), "AGAPE_PROFILING_V2_ENABLED=true\nPRIVATE_VALUE=do-not-report\n");
  const failures = await validateDisabledFeatureConfiguration(root, ["AGAPE_PROFILING_V2_ENABLED"], {
    AGAPE_PROFILING_V2_ENABLED: "false",
  });
  assert.deepEqual(failures, [".env.local: AGAPE_PROFILING_V2_ENABLED must be false"]);
  assert.equal(failures.join("\n").includes("do-not-report"), false);
});
