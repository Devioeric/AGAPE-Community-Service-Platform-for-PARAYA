import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const EVIDENCE_REQUIRED_FIELDS = [
  "Evidence-Status", "Evidence-Result", "Environment", "Executed-Date",
  "Operator", "Reviewer", "Release-Revision", "Evidence-Reference", "Artifact-SHA256",
  "Suite-ID", "Suite-Version", "Passed-Cases", "Failed-Cases", "Skipped-Cases",
];

const PLACEHOLDER = /(?:\bTBD\b|\bTODO\b|not executed|template[- ]only|example (?:name|reference)|<[^>]+>)/i;
const PERSON = /^\S+(?:\s+\S+)+\s+\(([^()]+)\)$/;
const REVISION = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function parseEvidenceFields(content) {
  const fields = new Map();
  for (const line of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*?)\s*$/.exec(line);
    if (match && !fields.has(match[1])) fields.set(match[1], match[2]);
  }
  return fields;
}

function personRole(value) {
  return PERSON.exec(value)?.[1] ?? null;
}

function validateDate(value, now, maxAgeDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return "Executed-Date must be YYYY-MM-DD";
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!Number.isFinite(timestamp)) return "Executed-Date is invalid";
  if (timestamp > today) return "Executed-Date cannot be in the future";
  if (maxAgeDays !== null && (today - timestamp) / 86_400_000 > maxAgeDays) return "evidence has expired";
  return null;
}

export function validateEvidenceContent(content, { expectedRevision, artifactSpec, now = new Date(), baseline = null } = {}) {
  if (!artifactSpec) throw new Error("An evidence artifact specification is required.");
  const failures = [];
  const fields = parseEvidenceFields(content);
  for (const key of [...EVIDENCE_REQUIRED_FIELDS, ...artifactSpec.requiredFields]) {
    if (!fields.get(key)?.trim()) failures.push(`missing ${key}`);
  }
  if (fields.get("Evidence-Status") !== "APPROVED") failures.push("Evidence-Status must be APPROVED");
  if (fields.get("Evidence-Result") !== "PASS") failures.push("Evidence-Result must be PASS");
  if (!artifactSpec.environments.includes(fields.get("Environment"))) failures.push("Environment is not allowed for this artifact");
  const dateFailure = validateDate(fields.get("Executed-Date"), now, artifactSpec.maxAgeDays);
  if (dateFailure) failures.push(dateFailure);

  const operator = fields.get("Operator") ?? "";
  const reviewer = fields.get("Reviewer") ?? "";
  const operatorRole = personRole(operator);
  const reviewerRole = personRole(reviewer);
  if (!operatorRole) failures.push("Operator must be a named person followed by a role in parentheses");
  else if (!artifactSpec.operatorRoles.includes(operatorRole)) failures.push("Operator role is not authorized for this artifact");
  if (!reviewerRole) failures.push("Reviewer must be a named person followed by a role in parentheses");
  else if (!artifactSpec.reviewerRoles.includes(reviewerRole)) failures.push("Reviewer role is not authorized for this artifact");
  if (operator && reviewer && operator.toLocaleLowerCase() === reviewer.toLocaleLowerCase()) failures.push("Reviewer must differ from Operator");

  const revision = fields.get("Release-Revision") ?? "";
  if (!REVISION.test(revision)) failures.push("Release-Revision must be a full 40-character Git commit");
  if (expectedRevision && revision.toLocaleLowerCase() !== expectedRevision.toLocaleLowerCase()) failures.push("Release-Revision does not match the release candidate");
  const reference = fields.get("Evidence-Reference") ?? "";
  if (reference.length < 8 || PLACEHOLDER.test(reference)) failures.push("Evidence-Reference is missing or placeholder text");
  if (!SHA256.test(fields.get("Artifact-SHA256") ?? "")) failures.push("Artifact-SHA256 must be a SHA-256 digest");
  if (fields.get("Suite-ID") !== artifactSpec.suiteId) failures.push(`Suite-ID must be ${artifactSpec.suiteId}`);
  if (!/^\d+\.\d+\.\d+$/.test(fields.get("Suite-Version") ?? "")) failures.push("Suite-Version must use semantic version format");
  const passed = Number.parseInt(fields.get("Passed-Cases") ?? "", 10);
  if (!Number.isInteger(passed) || passed < artifactSpec.minPassedCases) failures.push(`Passed-Cases must be at least ${artifactSpec.minPassedCases}`);
  if (fields.get("Failed-Cases") !== "0") failures.push("Failed-Cases must be 0");
  if (fields.get("Skipped-Cases") !== "0") failures.push("Skipped-Cases must be 0");
  if (PLACEHOLDER.test(content)) failures.push("evidence contains template or placeholder text");
  for (const [key, expected] of Object.entries(artifactSpec.requiredExact)) {
    if (fields.get(key) !== expected) failures.push(`${key} must be ${expected}`);
  }

  if (baseline || artifactSpec.baseline) {
    if (!baseline) failures.push("canonical baseline metadata is unavailable");
    else {
      if (fields.get("Baseline-File") !== baseline.file) failures.push(`Baseline-File must be ${baseline.file}`);
      const baselineHash = fields.get("Baseline-SHA256") ?? "";
      if (!SHA256.test(baselineHash)) failures.push("Baseline-SHA256 must be a SHA-256 digest");
      else if (baselineHash.toLocaleLowerCase() !== baseline.sha256.toLocaleLowerCase()) failures.push("Baseline-SHA256 does not match the canonical baseline");
    }
    for (const key of [
      "Authoritative-Dump-SHA256", "Replay-1-Dump-SHA256", "Replay-2-Dump-SHA256",
      "Migration-Ledger-SHA256", "Catalog-Count-Digest",
    ]) {
      if (!SHA256.test(fields.get(key) ?? "")) failures.push(`${key} must be a SHA-256 digest`);
    }
    if (fields.get("Replay-Hashes-Match") !== "true") failures.push("Replay-Hashes-Match must be true");
    if (fields.get("Unexplained-Differences") !== "0") failures.push("Unexplained-Differences must be 0");
    if (!/^\d+$/.test(fields.get("Object-Count") ?? "") || Number(fields.get("Object-Count")) < 1) failures.push("Object-Count must be positive");
    if (!(fields.get("PostgreSQL-Version") ?? "").trim()) failures.push("missing PostgreSQL-Version");
    if (!(fields.get("Supabase-CLI-Version") ?? "").trim()) failures.push("missing Supabase-CLI-Version");
  }
  return { valid: failures.length === 0, failures, fields };
}

export async function validateEvidenceFile(path, options) {
  return validateEvidenceContent(await readFile(path, "utf8"), options);
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}

export function validateReleaseRevisionContext(root, releaseRevision, allowedEvidencePaths) {
  if (!REVISION.test(releaseRevision ?? "")) throw new Error("--release-revision must be a full 40-character Git commit");
  const resolved = git(root, ["rev-parse", "--verify", `${releaseRevision}^{commit}`]);
  if (resolved.toLocaleLowerCase() !== releaseRevision.toLocaleLowerCase()) throw new Error("release revision did not resolve exactly");
  const head = git(root, ["rev-parse", "HEAD"]);
  if (git(root, ["status", "--porcelain", "--untracked-files=all"])) throw new Error("release evidence working tree is not clean");
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", releaseRevision, head], { cwd: root, windowsHide: true });
  if (ancestor.status !== 0) throw new Error("release revision must be an ancestor of the evidence commit");
  const allowed = new Set(allowedEvidencePaths.map((path) => path.replaceAll("\\", "/")));
  const changed = git(root, ["diff", "--name-only", `${releaseRevision}..${head}`])
    .split(/\r?\n/).filter(Boolean).map((path) => path.replaceAll("\\", "/"));
  const forbidden = changed.filter((path) => !allowed.has(path));
  if (forbidden.length) throw new Error(`evidence commit changes ${forbidden.length} non-evidence path(s)`);
  return { releaseRevision: resolved, evidenceRevision: head, changedEvidencePaths: changed };
}

function isOutsideRepository(root, path) {
  const candidate = relative(resolve(root), resolve(path));
  return candidate.startsWith("..") || isAbsolute(candidate);
}

export async function verifyPrivateArtifactIndex({ root, indexPath, expectedRevision, evidenceRecords }) {
  if (!indexPath) throw new Error("--artifact-index is required for final release verification");
  const resolvedIndex = resolve(indexPath);
  if (!isOutsideRepository(root, resolvedIndex)) throw new Error("private artifact index must be outside the repository");
  const index = JSON.parse(await readFile(resolvedIndex, "utf8"));
  if (index.schema !== "agape.private-artifact-index.v1") throw new Error("unsupported private artifact index schema");
  if (index.releaseRevision !== expectedRevision) throw new Error("private artifact index revision mismatch");
  if (!Array.isArray(index.artifacts)) throw new Error("private artifact index artifacts must be an array");
  const entries = new Map();
  for (const entry of index.artifacts) {
    if (!entry || typeof entry.reference !== "string" || typeof entry.bundlePath !== "string" || !SHA256.test(entry.sha256 ?? "")) throw new Error("private artifact index contains a malformed entry");
    if (entries.has(entry.reference)) throw new Error("private artifact index contains a duplicate reference");
    entries.set(entry.reference, entry);
  }
  const requiredReferences = new Set();
  for (const record of evidenceRecords) {
    const reference = record.fields.get("Evidence-Reference");
    const expectedHash = record.fields.get("Artifact-SHA256");
    if (requiredReferences.has(reference)) throw new Error("evidence references must be unique per gate");
    requiredReferences.add(reference);
    const entry = entries.get(reference);
    if (!entry) throw new Error("private artifact index is missing a required evidence reference");
    const bundlePath = resolve(entry.bundlePath);
    if (!isOutsideRepository(root, bundlePath)) throw new Error("private artifact bundle must be outside the repository");
    if (!(await stat(bundlePath)).isFile()) throw new Error("private artifact bundle must be one file");
    const actualHash = sha256(await readFile(bundlePath));
    if (actualHash !== entry.sha256 || actualHash !== expectedHash) throw new Error("private artifact bundle digest mismatch");
  }
  if (entries.size !== requiredReferences.size) throw new Error("private artifact index contains unexpected entries for this gate");
  return { verifiedArtifacts: requiredReferences.size };
}

export async function validateDisabledFeatureConfiguration(root, flags, env = process.env) {
  const failures = [];
  for (const flag of flags) {
    if (String(env[flag] ?? "").toLocaleLowerCase() !== "false") failures.push(`${flag} must be explicitly false in the release environment`);
  }
  const envFiles = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\.env(?:\..+)?$/i.test(entry.name))
    .map((entry) => entry.name);
  for (const name of envFiles) {
    const source = await readFile(resolve(root, name), "utf8");
    for (const flag of flags) {
      const match = new RegExp(`^\\s*${flag}\\s*=\\s*([^#\\r\\n]*)`, "m").exec(source);
      if (!match) failures.push(`${name}: ${flag} must be declared false`);
      else if (match[1].trim().replace(/^[\"']|[\"']$/g, "").toLocaleLowerCase() !== "false") failures.push(`${name}: ${flag} must be false`);
    }
  }
  return failures;
}
