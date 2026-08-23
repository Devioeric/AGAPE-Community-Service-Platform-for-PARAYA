import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const GENERATED_SEGMENTS = new Set([
  ".next",
  ".supabase",
  ".vercel",
  "build",
  "coverage",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);

const PRIVATE_PATHS = new Set([
  ".claude/settings.local.json",
]);

const KNOWN_ROOT_FILES = new Set([
  ".env.example",
  ".gitattributes",
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
  "TESTING.md",
  "components.json",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "postcss.config.mjs",
  "tailwind.config.ts",
  "tsconfig.json",
  "vercel.json",
]);

const KNOWN_ROOT_DIRECTORIES = new Set([
  "docs",
  "e2e",
  "public",
  "scripts",
  "src",
  "supabase",
  "test",
]);

const TEXT_EXTENSIONS = new Set([
  ".css", ".csv", ".env", ".html", ".js", ".json", ".jsx", ".md",
  ".drawio", ".mjs", ".py", ".sql", ".svg", ".toml", ".ts", ".tsx", ".txt", ".xml",
  ".yaml", ".yml",
]);

const SECRET_RULES = [
  { id: "private-key-block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { id: "jwt-token", pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: "supabase-secret", pattern: /\bsb_secret_[A-Za-z0-9_-]{16,}\b/ },
  { id: "openai-secret", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { id: "anthropic-secret", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { id: "postgres-credential-url", pattern: /\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/i },
  {
    id: "env-service-role-value",
    pattern: /^[ \t]*SUPABASE_SERVICE_ROLE_KEY[ \t]*=[ \t]*(?![ \t]*(?:#.*)?$)[^\r\n]+$/m,
  },
];

export function normalizeRepositoryPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function parseGitPorcelainZ(source) {
  const records = source.split("\0");
  const entries = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.length < 4 || record[2] !== " ") {
      throw new Error("Unexpected git porcelain record.");
    }
    const state = record.slice(0, 2);
    const path = normalizeRepositoryPath(record.slice(3));
    entries.push({ path, state, tracked: state !== "??" });
    if (/[RC]/.test(state)) index += 1;
  }
  return entries;
}

function hasGeneratedSegment(path) {
  return path.split("/").some((segment) => GENERATED_SEGMENTS.has(segment));
}

export function classifyReleasePath(rawPath) {
  const path = normalizeRepositoryPath(rawPath);
  const lower = path.toLowerCase();

  if (hasGeneratedSegment(path) || lower.endsWith(".log") || lower.endsWith(".tsbuildinfo")) {
    return { classification: "exclude-generated", reason: "generated-or-cache-output" };
  }
  if (
    PRIVATE_PATHS.has(path)
    || (/^\.env(?:\..+)?$/i.test(path) && path !== ".env.example")
    || /(?:^|\/)private-evidence(?:\/|$)/i.test(path)
    || /\.(?:backup|bak|dump)$/i.test(path)
  ) {
    return { classification: "exclude-private", reason: "local-private-or-sensitive-input" };
  }
  if (path === "AGAPE-ERD.drawio" || path.startsWith("ProcessFiles Paraya/")) {
    return { classification: "ambiguous-needs-owner-review", reason: "research-or-source-artifact-requires-owner-review" };
  }

  const [root, ...rest] = path.split("/");
  if ((rest.length === 0 && KNOWN_ROOT_FILES.has(root)) || KNOWN_ROOT_DIRECTORIES.has(root)) {
    return { classification: "include", reason: "recognized-repository-content" };
  }
  return { classification: "ambiguous-needs-owner-review", reason: "unrecognized-repository-path" };
}

export function applyOwnerApprovals(entry, approvals = {}) {
  const approvedPaths = new Set(approvals.approvedIncludePaths ?? []);
  const approvedPrefixes = approvals.approvedIncludePrefixes ?? [];
  const pathApproved = approvedPaths.has(entry.path)
    || approvedPrefixes.some((prefix) => entry.path.startsWith(prefix));
  const classification = entry.classification === "ambiguous-needs-owner-review" && pathApproved
    ? "include"
    : entry.classification;
  const reason = classification === "include" && entry.classification !== "include"
    ? "owner-approved-research-artifact"
    : entry.reason;
  const acknowledged = new Set(approvals.acknowledgedSyntheticSecretFixtures?.[entry.path] ?? []);
  const acknowledgedSecretRuleIds = entry.secretRuleIds.filter((rule) => acknowledged.has(rule));
  const unresolvedSecretRuleIds = entry.secretRuleIds.filter((rule) => !acknowledged.has(rule));
  return {
    ...entry,
    classification,
    reason,
    secretRuleIds: unresolvedSecretRuleIds,
    acknowledgedSecretRuleIds,
  };
}

export function shouldScanReleaseEntry(entry) {
  return entry.classification === "include" && !entry.state.includes("D");
}

function isTextCandidate(path) {
  if ([".gitignore", "Dockerfile"].includes(path)) return true;
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

export async function scanFileForSecretRuleIds(absolutePath, repositoryPath) {
  if (!isTextCandidate(repositoryPath)) return [];
  const value = await readFile(absolutePath);
  if (value.length > 5 * 1024 * 1024 || value.includes(0)) return [];
  const source = value.toString("utf8");
  return SECRET_RULES.filter((rule) => rule.pattern.test(source)).map((rule) => rule.id);
}

export function summarizeManifestEntries(entries) {
  const summary = {
    total: entries.length,
    include: 0,
    "exclude-generated": 0,
    "exclude-private": 0,
    "exclude-ignored": 0,
    "ambiguous-needs-owner-review": 0,
    secretFindings: 0,
    acknowledgedSyntheticSecretFindings: 0,
  };
  for (const entry of entries) {
    summary[entry.classification] += 1;
    summary.secretFindings += entry.secretRuleIds.length;
    summary.acknowledgedSyntheticSecretFindings += entry.acknowledgedSecretRuleIds?.length ?? 0;
  }
  return summary;
}
