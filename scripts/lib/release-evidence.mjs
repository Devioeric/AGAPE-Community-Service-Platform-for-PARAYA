import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export const EVIDENCE_ENVIRONMENTS = new Set(["disposable-clone", "development", "staging", "production"]);
export const EVIDENCE_REQUIRED_FIELDS = [
  "Evidence-Status", "Evidence-Result", "Environment", "Executed-Date",
  "Operator", "Reviewer", "Release-Revision", "Evidence-Reference", "Artifact-SHA256",
];

const PLACEHOLDER = /(?:\bTBD\b|\bTODO\b|not executed|template[- ]only|example (?:name|reference)|<[^>]+>)/i;
const PERSON = /^\S+(?:\s+\S+)+\s+\([^()]+\)$/;
const REVISION = /^[a-f0-9]{7,64}$/i;
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

function maxAgeDays(env) {
  const parsed = Number.parseInt(env.AGAPE_EVIDENCE_MAX_AGE_DAYS ?? "180", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 365 ? parsed : 180;
}

export function validateEvidenceContent(content, {
  expectedRevision,
  now = new Date(),
  env = process.env,
  baseline = null,
} = {}) {
  const failures = [];
  const fields = parseEvidenceFields(content);
  for (const key of EVIDENCE_REQUIRED_FIELDS) {
    if (!fields.get(key)?.trim()) failures.push(`missing ${key}`);
  }

  if (fields.get("Evidence-Status") !== "APPROVED") failures.push("Evidence-Status must be APPROVED");
  if (fields.get("Evidence-Result") !== "PASS") failures.push("Evidence-Result must be PASS");
  if (!EVIDENCE_ENVIRONMENTS.has(fields.get("Environment"))) failures.push("Environment is not an approved evidence environment");

  const executed = fields.get("Executed-Date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(executed ?? "")) failures.push("Executed-Date must be YYYY-MM-DD");
  else {
    const timestamp = Date.parse(`${executed}T00:00:00Z`);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (!Number.isFinite(timestamp)) failures.push("Executed-Date is invalid");
    else if (timestamp > today) failures.push("Executed-Date cannot be in the future");
    else if ((today - timestamp) / 86_400_000 > maxAgeDays(env)) failures.push("evidence has expired");
  }

  const operator = fields.get("Operator") ?? "";
  const reviewer = fields.get("Reviewer") ?? "";
  if (!PERSON.test(operator)) failures.push("Operator must be a named person followed by a role in parentheses");
  if (!PERSON.test(reviewer)) failures.push("Reviewer must be a named person followed by a role in parentheses");
  if (operator && reviewer && operator.toLocaleLowerCase() === reviewer.toLocaleLowerCase()) failures.push("Reviewer must differ from Operator");

  const revision = fields.get("Release-Revision") ?? "";
  if (!REVISION.test(revision)) failures.push("Release-Revision must be an immutable hexadecimal Git revision");
  if (expectedRevision && revision.toLocaleLowerCase() !== expectedRevision.toLocaleLowerCase()) failures.push("Release-Revision does not match the release candidate");

  const reference = fields.get("Evidence-Reference") ?? "";
  if (reference.length < 8 || PLACEHOLDER.test(reference)) failures.push("Evidence-Reference is missing or placeholder text");
  if (!SHA256.test(fields.get("Artifact-SHA256") ?? "")) failures.push("Artifact-SHA256 must be a SHA-256 digest");
  if (PLACEHOLDER.test(content)) failures.push("evidence contains template or placeholder text");

  if (baseline) {
    const baselineFile = fields.get("Baseline-File");
    const baselineHash = fields.get("Baseline-SHA256") ?? "";
    if (baselineFile !== baseline.file) failures.push(`Baseline-File must be ${baseline.file}`);
    if (!SHA256.test(baselineHash)) failures.push("Baseline-SHA256 must be a SHA-256 digest");
    else if (baselineHash.toLocaleLowerCase() !== baseline.sha256.toLocaleLowerCase()) failures.push("Baseline-SHA256 does not match the canonical baseline");
    for (const key of ["Authoritative-Dump-SHA256", "Replay-Dump-SHA256", "Migration-Ledger-SHA256"]) {
      if (!SHA256.test(fields.get(key) ?? "")) failures.push(`${key} must be a SHA-256 digest`);
    }
    if (fields.get("Unexplained-Differences") !== "0") failures.push("Unexplained-Differences must be 0");
    if (!/^\d+$/.test(fields.get("Object-Count") ?? "") || Number(fields.get("Object-Count")) < 1) failures.push("Object-Count must be positive");
    if (!(fields.get("PostgreSQL-Version") ?? "").trim()) failures.push("missing PostgreSQL-Version");
    if (!(fields.get("Supabase-CLI-Version") ?? "").trim()) failures.push("missing Supabase-CLI-Version");
  }

  return { valid: failures.length === 0, failures, fields };
}

export async function validateEvidenceFile(path, options) {
  const content = await readFile(path, "utf8");
  return validateEvidenceContent(content, options);
}

export function getReleaseRevision(root, env = process.env) {
  const configured = env.AGAPE_RELEASE_REVISION?.trim();
  const revision = configured || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  if (!REVISION.test(revision)) throw new Error("release revision is not a valid Git commit");
  const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  if (status) throw new Error("release candidate working tree is not clean");
  return revision;
}

export async function validateDisabledFeatureConfiguration(root, flags, env = process.env) {
  const failures = [];
  for (const flag of flags) {
    if (String(env[flag] ?? "false").toLocaleLowerCase() !== "false") {
      failures.push(`${flag} must be explicitly false in the release environment`);
    }
  }

  const envFiles = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\.env(?:\..+)?$/i.test(entry.name))
    .map((entry) => entry.name);
  for (const name of envFiles) {
    const source = await readFile(resolve(root, name), "utf8");
    for (const flag of flags) {
      const match = new RegExp(`^\\s*${flag}\\s*=\\s*([^#\\r\\n]*)`, "m").exec(source);
      if (!match) failures.push(`${name}: ${flag} must be declared false`);
      else if (match[1].trim().replace(/^['"]|['"]$/g, "").toLocaleLowerCase() !== "false") {
        failures.push(`${name}: ${flag} must be false`);
      }
    }
  }
  return failures;
}
