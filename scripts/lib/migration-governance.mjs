import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const CANONICAL_BASELINE_NAME = "20260815000000_pre_phase0_baseline.sql";
export const TIMESTAMPED_MIGRATION_PATTERN = /^(\d{14})_([a-z0-9][a-z0-9_]*)\.sql$/;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function classifyMigrationName(name) {
  const match = TIMESTAMPED_MIGRATION_PATTERN.exec(name);
  if (match) {
    return {
      classification: name === CANONICAL_BASELINE_NAME ? "canonical-baseline" : "timestamped",
      version: match[1],
      slug: match[2],
    };
  }
  return {
    classification: /^_combined.*\.sql$/i.test(name) ? "legacy-combined" : "legacy-unordered",
    version: null,
    slug: null,
  };
}

export function extractCombinedMembers(sql) {
  return Array.from(sql.matchAll(/^--\s*##\s+([^\s]+\.sql)\s*$/gim), (match) => match[1])
    .sort((left, right) => left.localeCompare(right));
}

export function extractUsersRoleConstraintSets(sql) {
  const sets = [];
  const constraintPattern = /ADD\s+CONSTRAINT\s+"?users_role_check"?\s+CHECK\s*\(\s*role\s+IN\s*\(([\s\S]*?)\)\s*\)\s*;/gi;
  for (const constraint of sql.matchAll(constraintPattern)) {
    const roles = Array.from(constraint[1].matchAll(/'([^']+)'/g), (match) => match[1]);
    sets.push(Array.from(new Set(roles)).sort((left, right) => left.localeCompare(right)));
  }
  return sets;
}

function containsTopLevelDataLoad(sql) {
  return /^COPY\s+[^\r\n]+\s+FROM\s+stdin;\s*$/im.test(sql)
    || /^INSERT\s+INTO\s+[^\r\n]+\s+VALUES\s*\(/im.test(sql);
}

function hazard(code, severity, message, files = []) {
  return { code, severity, message, files: [...files].sort((left, right) => left.localeCompare(right)) };
}

export function analyzeMigrationEntries(entries, { ledgerVersions = null } = {}) {
  const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  const timestamped = sorted.filter((entry) => entry.version);
  const legacy = sorted.filter((entry) => !entry.version);
  const nameSet = new Set(sorted.map((entry) => entry.name));
  const hazards = [];

  const baseline = sorted.find((entry) => entry.name === CANONICAL_BASELINE_NAME) ?? null;
  if (!baseline) {
    hazards.push(hazard(
      "CANONICAL_BASELINE_MISSING",
      "blocker",
      `The verified schema-only baseline ${CANONICAL_BASELINE_NAME} is missing; it must be captured from reconciled authoritative schema, never inferred from these files.`,
    ));
  } else if (containsTopLevelDataLoad(baseline.sql)) {
    hazards.push(hazard(
      "CANONICAL_BASELINE_CONTAINS_DATA_LOAD",
      "blocker",
      "The canonical baseline contains a top-level COPY or INSERT data load and is not a schema-only candidate.",
      [baseline.name],
    ));
  }

  const versions = new Map();
  for (const entry of timestamped) {
    const names = versions.get(entry.version) ?? [];
    names.push(entry.name);
    versions.set(entry.version, names);
  }
  for (const [version, names] of versions) {
    if (names.length > 1) {
      hazards.push(hazard(
        "DUPLICATE_TIMESTAMP",
        "blocker",
        `Migration version ${version} is assigned to more than one file.`,
        names,
      ));
    }
  }

  if (legacy.length) {
    hazards.push(hazard(
      "UNORDERED_LEGACY_INPUTS_ACTIVE",
      "blocker",
      `${legacy.length} SQL inputs have no migration-ledger timestamp. Their order and applied state cannot be inferred from filenames.`,
      legacy.map((entry) => entry.name),
    ));
  }

  const combinedOverlaps = [];
  for (const entry of legacy.filter((candidate) => candidate.classification === "legacy-combined")) {
    const members = extractCombinedMembers(entry.sql).filter((member) => nameSet.has(member));
    if (members.length) {
      combinedOverlaps.push({ combined: entry.name, members });
      hazards.push(hazard(
        "COMBINED_SCRIPT_OVERLAPS_INDIVIDUAL_INPUTS",
        "blocker",
        `${entry.name} embeds ${members.length} SQL files that are also present individually; applying both paths can repeat or overwrite schema changes.`,
        [entry.name, ...members],
      ));
    }
  }

  const roleConstraintVariants = [];
  for (const entry of legacy) {
    for (const roles of extractUsersRoleConstraintSets(entry.sql)) {
      roleConstraintVariants.push({ file: entry.name, roles });
    }
  }
  const uniqueRoleSets = new Set(roleConstraintVariants.map((variant) => variant.roles.join("\u0000")));
  if (uniqueRoleSets.size > 1) {
    hazards.push(hazard(
      "CONTRADICTORY_USERS_ROLE_CONSTRAINTS",
      "blocker",
      "Unordered legacy files replace users_role_check with different accepted-role sets; the final authorization schema depends on manual execution order.",
      roleConstraintVariants.map((variant) => variant.file),
    ));
  }

  const manualArtifacts = legacy
    .filter((entry) => /paste-and-run|run this in the supabase sql editor/i.test(entry.sql))
    .map((entry) => entry.name);
  if (manualArtifacts.length) {
    hazards.push(hazard(
      "MANUAL_EXECUTION_ARTIFACTS_ACTIVE",
      "blocker",
      "Manual SQL-editor or paste-and-run artifacts remain in the active migration directory and are not tied to a deterministic ledger order.",
      manualArtifacts,
    ));
  }

  let ledger = null;
  if (ledgerVersions) {
    const uniqueLedger = Array.from(new Set(ledgerVersions)).sort((left, right) => left.localeCompare(right));
    const localByVersion = new Map(timestamped.map((entry) => [entry.version, entry.name]));
    const missingLocally = uniqueLedger.filter((version) => !localByVersion.has(version));
    const latestApplied = uniqueLedger.at(-1) ?? null;
    const gapsBeforeLatest = latestApplied
      ? timestamped
        .filter((entry) => entry.name !== CANONICAL_BASELINE_NAME && entry.version <= latestApplied && !uniqueLedger.includes(entry.version))
        .map((entry) => entry.version)
      : [];
    const pendingAfterLatest = timestamped
      .filter((entry) => entry.name !== CANONICAL_BASELINE_NAME && (!latestApplied || entry.version > latestApplied))
      .map((entry) => entry.version);
    ledger = { versions: uniqueLedger, latestApplied, missingLocally, gapsBeforeLatest, pendingAfterLatest };
    if (missingLocally.length) {
      hazards.push(hazard(
        "LEDGER_VERSIONS_MISSING_LOCALLY",
        "blocker",
        `The captured ledger contains ${missingLocally.length} version(s) with no matching timestamped repository file.`,
        missingLocally,
      ));
    }
    if (gapsBeforeLatest.length) {
      hazards.push(hazard(
        "LOCAL_LEDGER_GAPS",
        "blocker",
        `The repository contains ${gapsBeforeLatest.length} migration version(s) at or before the latest applied version that are absent from the captured ledger.`,
        gapsBeforeLatest,
      ));
    }
  }

  hazards.sort((left, right) => left.code.localeCompare(right.code));
  return {
    baseline: {
      expected: CANONICAL_BASELINE_NAME,
      present: Boolean(baseline),
      sha256: baseline?.sha256 ?? null,
    },
    totals: { sql: sorted.length, timestamped: timestamped.length, legacyUnordered: legacy.length },
    timestamped: timestamped.map(({ name, version, slug, sha256: checksum, classification }) => ({
      file: name, version, slug, sha256: checksum, classification,
    })),
    legacy: legacy.map(({ name, sha256: checksum, classification }) => ({ file: name, sha256: checksum, classification })),
    combinedOverlaps,
    roleConstraintVariants,
    ledger,
    hazards,
    ready: hazards.every((item) => item.severity !== "blocker"),
  };
}

export async function readLedgerVersions(path) {
  const source = await readFile(path, "utf8");
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const versions = [];
  for (let index = 0; index < lines.length; index += 1) {
    const value = lines[index].trim();
    if (!value || value.startsWith("#")) continue;
    if (!/^\d{14}$/.test(value)) {
      throw new Error(`Invalid ledger version at line ${index + 1}; expected one 14-digit version per line.`);
    }
    versions.push(value);
  }
  if (!versions.length) throw new Error("Ledger capture is empty.");
  if (new Set(versions).size !== versions.length) throw new Error("Ledger capture contains duplicate versions.");
  return versions;
}

export async function inventoryMigrationDirectory(directory, options = {}) {
  const names = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const entries = await Promise.all(names.map(async (name) => {
    const sql = await readFile(join(directory, name), "utf8");
    return { name, sql, sha256: sha256(sql), ...classifyMigrationName(name) };
  }));
  return analyzeMigrationEntries(entries, options);
}

export function inspectSchemaOnlyDump(source) {
  const problems = [];
  if (!/CREATE\s+(?:TABLE|FUNCTION|SCHEMA|TYPE|VIEW)|ALTER\s+TABLE/i.test(source)) {
    problems.push("No schema-definition statement was found.");
  }
  if (/^COPY\s+[^\r\n]+\s+FROM\s+stdin;\s*$/im.test(source)) {
    problems.push("A top-level COPY data load was found.");
  }
  if (/^INSERT\s+INTO\s+[^\r\n]+\s+VALUES\s*\(/im.test(source)) {
    problems.push("A top-level INSERT data load was found.");
  }
  if (/^(?:ALTER|CREATE)\s+ROLE\b[^;]*\bPASSWORD\b/im.test(source)) {
    problems.push("A role password statement was found.");
  }
  if (/postgres(?:ql)?:\/\/[^\s'";]+/i.test(source)) {
    problems.push("A database connection string was found.");
  }
  if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/.test(source)) {
    problems.push("A JWT-like value was found.");
  }
  if (/\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|DATABASE_URL)\s*[:=]/i.test(source)) {
    problems.push("A credential-bearing environment assignment was found.");
  }
  return problems;
}

export function normalizeSchemaDump(source) {
  const ignored = [
    /^-- Dumped from database version /,
    /^-- Dumped by pg_dump version /,
    /^-- Started on /,
    /^-- Completed on /,
    /^\\restrict\s+\S+\s*$/,
    /^\\unrestrict\s+\S+\s*$/,
  ];
  const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const normalized = [];
  for (const line of lines) {
    const clean = line.replace(/[ \t]+$/g, "");
    if (ignored.some((pattern) => pattern.test(clean))) continue;
    if (!clean && normalized.at(-1) === "") continue;
    normalized.push(clean);
  }
  while (normalized[0] === "") normalized.shift();
  while (normalized.at(-1) === "") normalized.pop();
  return `${normalized.join("\n")}\n`;
}

export function compareSchemaDumps(authoritative, replay) {
  const authoritativeProblems = inspectSchemaOnlyDump(authoritative);
  const replayProblems = inspectSchemaOnlyDump(replay);
  const left = normalizeSchemaDump(authoritative);
  const right = normalizeSchemaDump(replay);
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  let firstDifferentLine = null;
  const comparedLines = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < comparedLines; index += 1) {
    if (leftLines[index] !== rightLines[index]) {
      firstDifferentLine = index + 1;
      break;
    }
  }
  return {
    equivalent: authoritativeProblems.length === 0 && replayProblems.length === 0 && left === right,
    authoritative: { sha256: sha256(left), normalizedBytes: Buffer.byteLength(left), problems: authoritativeProblems },
    replay: { sha256: sha256(right), normalizedBytes: Buffer.byteLength(right), problems: replayProblems },
    firstDifferentLine,
  };
}
