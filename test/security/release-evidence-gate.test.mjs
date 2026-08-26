import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EVIDENCE_ARTIFACT_SPECS, getEvidenceArtifactSpec } from "../../scripts/lib/evidence-artifact-specs.mjs";
import { renderEvidenceTemplate, templateRelativePathForSpec } from "../../scripts/lib/evidence-templates.mjs";
import { parseReleaseGateArguments } from "../../scripts/lib/run-release-gate.mjs";
import { parseEvidenceFields, sha256, validateDisabledFeatureConfiguration, validateEvidenceContent, validateReleaseRevisionContext, verifyPrivateArtifactIndex } from "../../scripts/lib/release-evidence.mjs";

const revision = "a".repeat(40);
const jwtSpec = getEvidenceArtifactSpec("docs/release-evidence/jwt-rls-matrix.md");
const approved = `Evidence-Status: APPROVED
Evidence-Result: PASS
Environment: disposable-clone
Executed-Date: 2026-08-17
Operator: Maria Santos (Security Test Operator)
Review-Mode: SOLO-DEVELOPER-SELF-REVIEW
Independent-Review-Performed: false
Approval-Scope: DEVELOPMENT-READINESS-ONLY
Release-Revision: ${revision}
Evidence-Reference: PRIVATE-EVIDENCE-AGAPE-2042
Artifact-SHA256: ${"9".repeat(64)}
Suite-ID: ${jwtSpec.suiteId}
Suite-Version: 1.0.0
Passed-Cases: 20
Failed-Cases: 0
Skipped-Cases: 0
`;

test("approved evidence requires artifact-specific solo-developer self-review", () => {
  const result = validateEvidenceContent(approved, { expectedRevision: revision, artifactSpec: jwtSpec, now: new Date("2026-08-17T12:00:00Z") });
  assert.equal(result.valid, true, result.failures.join("; "));
});

test("templates, stale dates, abbreviated revisions, and skipped cases fail closed", () => {
  const content = approved.replace("APPROVED", "DRAFT").replace("2026-08-17", "2025-01-01")
    .replace(`Release-Revision: ${revision}`, "Release-Revision: bbbbbbb")
    .replace("PRIVATE-EVIDENCE-AGAPE-2042", "TBD").replace("Skipped-Cases: 0", "Skipped-Cases: 1");
  const result = validateEvidenceContent(content, { expectedRevision: revision, artifactSpec: jwtSpec, now: new Date("2026-08-17T12:00:00Z") });
  assert.equal(result.valid, false);
  assert.match(result.failures.join("\n"), /APPROVED|expired|40-character|placeholder|Skipped/i);
});

test("solo-developer self-review cannot authorize production", () => {
  const content = approved.replace("Environment: disposable-clone", "Environment: production");
  const spec = { ...jwtSpec, environments: ["disposable-clone", "production"] };
  const result = validateEvidenceContent(content, { expectedRevision: revision, artifactSpec: spec, now: new Date("2026-08-17T12:00:00Z") });
  assert.equal(result.valid, false);
  assert.match(result.failures.join("\n"), /cannot authorize a production environment/);
});

test("baseline evidence binds two clean replays and catalog digest", () => {
  const digest = "c".repeat(64);
  const spec = getEvidenceArtifactSpec("docs/release-evidence/baseline-manifest.md");
  const content = approved.replace("Security Test Operator", "Database Operator")
    .replace(jwtSpec.suiteId, spec.suiteId);
  const result = validateEvidenceContent(`${content}
Baseline-File: 20260815000000_pre_phase0_baseline.sql
Baseline-SHA256: ${digest}
Authoritative-Dump-SHA256: ${"d".repeat(64)}
Replay-1-Dump-SHA256: ${"e".repeat(64)}
Replay-2-Dump-SHA256: ${"e".repeat(64)}
Replay-Hashes-Match: true
Migration-Ledger-SHA256: ${"f".repeat(64)}
Catalog-Count-Digest: ${"8".repeat(64)}
Unexplained-Differences: 0
Object-Count: 42
PostgreSQL-Version: 17.6
Supabase-CLI-Version: 2.114.0
`, { expectedRevision: revision, artifactSpec: spec, now: new Date("2026-08-17T12:00:00Z"), baseline: { file: "20260815000000_pre_phase0_baseline.sql", sha256: digest } });
  assert.equal(result.valid, true, result.failures.join("; "));
});

test("release configuration requires explicit false process and file values", async () => {
  const root = await mkdtemp(join(tmpdir(), "agape-release-flags-"));
  try {
    await writeFile(join(root, ".env.example"), "AGAPE_PROFILING_V2_ENABLED=false\nPRIVATE_VALUE=do-not-report\n");
    await writeFile(join(root, ".env.local"), "AGAPE_PROFILING_V2_ENABLED=true\nPRIVATE_VALUE=do-not-report\n");
    const failures = await validateDisabledFeatureConfiguration(root, ["AGAPE_PROFILING_V2_ENABLED"], { AGAPE_PROFILING_V2_ENABLED: "false" });
    assert.deepEqual(failures, [".env.local: AGAPE_PROFILING_V2_ENABLED must be false"]);
    const unset = await validateDisabledFeatureConfiguration(root, ["AGAPE_PROFILING_V2_ENABLED"], {});
    assert.ok(unset.includes("AGAPE_PROFILING_V2_ENABLED must be explicitly false in the release environment"));
    assert.equal([...failures, ...unset].join("\n").includes("do-not-report"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("private artifact index verifies exact outside-repository bundle digests", async () => {
  const base = await mkdtemp(join(tmpdir(), "agape-private-index-"));
  const root = join(base, "repository"); const privateDirectory = join(base, "private");
  try {
    await mkdir(root); await mkdir(privateDirectory);
    const bundle = join(privateDirectory, "bundle.enc"); const indexPath = join(privateDirectory, "index.json");
    await writeFile(bundle, "encrypted-test-bundle", "utf8");
    const digest = sha256(Buffer.from("encrypted-test-bundle"));
    await writeFile(indexPath, JSON.stringify({ schema: "agape.private-artifact-index.v1", releaseRevision: revision, artifacts: [{ reference: "PRIVATE-EVIDENCE-AGAPE-2042", bundlePath: bundle, sha256: digest }] }), "utf8");
    const fields = parseEvidenceFields(approved.replace("9".repeat(64), digest));
    const result = await verifyPrivateArtifactIndex({ root, indexPath, expectedRevision: revision, evidenceRecords: [{ fields }] });
    assert.equal(result.verifiedArtifacts, 1);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test("release revision context allows only evidence-only descendant commits", async () => {
  const root = await mkdtemp(join(tmpdir(), "agape-release-revision-"));
  const run = (args) => execFileSync("git", args, { cwd: root, windowsHide: true, stdio: "ignore" });
  try {
    run(["init"]); run(["config", "user.email", "release@example.invalid"]); run(["config", "user.name", "Release Test"]);
    await writeFile(join(root, "README.md"), "candidate\n"); run(["add", "README.md"]); run(["commit", "-m", "candidate"]);
    const releaseRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    await mkdir(join(root, "docs/release-evidence"), { recursive: true });
    await writeFile(join(root, "docs/release-evidence/result.md"), "evidence\n"); run(["add", "."]); run(["commit", "-m", "evidence"]);
    assert.equal(validateReleaseRevisionContext(root, releaseRevision, ["docs/release-evidence/result.md"]).releaseRevision, releaseRevision);
    assert.throws(() => validateReleaseRevisionContext(root, releaseRevision.slice(0, 7), ["docs/release-evidence/result.md"]), /40-character/);
    await writeFile(join(root, "README.md"), "changed after evidence\n"); run(["add", "README.md"]); run(["commit", "-m", "forbidden"]);
    assert.throws(() => validateReleaseRevisionContext(root, releaseRevision, ["docs/release-evidence/result.md"]), /non-evidence/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("release gate CLI requires explicit revision and private or envelope mode", () => {
  assert.throws(() => parseReleaseGateArguments([]), /release-revision/);
  assert.throws(() => parseReleaseGateArguments(["--release-revision", revision]), /artifact-index/);
  assert.equal(parseReleaseGateArguments(["--release-revision", revision, "--envelope-only"]).envelopeOnly, true);
});

test("artifact registry has unique suites and generated non-executable templates", async () => {
  const suites = new Set();
  for (const spec of EVIDENCE_ARTIFACT_SPECS.values()) {
    assert.equal(suites.has(spec.suiteId), false, `duplicate suite ${spec.suiteId}`);
    suites.add(spec.suiteId);
    const templatePath = join(process.cwd(), templateRelativePathForSpec(spec));
    await access(templatePath);
    assert.equal(await readFile(templatePath, "utf8"), renderEvidenceTemplate(spec));
  }
});
