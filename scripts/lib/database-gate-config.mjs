import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const DATABASE_GATE_SCOPE_FILE = "supabase/database-gate-scopes.json";
export const DATABASE_GATE_SCOPE_SCHEMA = "agape.database-gate-scopes.v1";
export const EXPECTED_SUPABASE_CLI_VERSION = "2.114.0";
export const EXPECTED_POSTGRES_MAJOR = 17;
export const EXPECTED_SOURCE_PROJECT_ID = "agape-local";
export const EXPECTED_DISPOSABLE_PROJECT_ID = "agape-release-gate";

const TIMESTAMPED_MIGRATION = /^\d{14}_[a-z0-9_]+\.sql$/;
const SAFE_RELATIVE_PATH = /^(?![A-Za-z]:)(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[A-Za-z0-9_./-]+$/;

function uniqueStrings(values) {
  return Array.isArray(values)
    && values.every((value) => typeof value === "string" && value.length > 0)
    && new Set(values).size === values.length;
}

function validateRelativePaths(values, label, problems) {
  if (!uniqueStrings(values)) {
    problems.push(`${label} must contain unique non-empty strings`);
    return;
  }
  for (const value of values) {
    if (!SAFE_RELATIVE_PATH.test(value.replaceAll("\\", "/"))) problems.push(`${label} contains an unsafe path`);
  }
}

export function validateDatabaseGateScopeManifest(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return ["database-gate scope manifest is malformed"];
  if (manifest.schema !== DATABASE_GATE_SCOPE_SCHEMA) problems.push(`scope manifest schema must be ${DATABASE_GATE_SCOPE_SCHEMA}`);
  if (manifest.supabaseCliVersion !== EXPECTED_SUPABASE_CLI_VERSION) problems.push(`Supabase CLI version must be ${EXPECTED_SUPABASE_CLI_VERSION}`);
  if (manifest.postgresMajorVersion !== EXPECTED_POSTGRES_MAJOR) problems.push(`PostgreSQL major version must be ${EXPECTED_POSTGRES_MAJOR}`);
  if (manifest.sourceProjectId !== EXPECTED_SOURCE_PROJECT_ID) problems.push(`source project ID must be ${EXPECTED_SOURCE_PROJECT_ID}`);
  if (manifest.disposableProjectId !== EXPECTED_DISPOSABLE_PROJECT_ID) problems.push(`disposable project ID must be ${EXPECTED_DISPOSABLE_PROJECT_ID}`);

  const expectedPorts = { api: 54321, database: 54322, shadow: 54320, studio: 54323, inbucket: 54324 };
  for (const [name, port] of Object.entries(expectedPorts)) {
    if (manifest.ports?.[name] !== port) problems.push(`${name} port must be ${port}`);
  }

  const requiredScopes = ["phase1", "phase2", "reconciliation-applied", "reconciliation-full"];
  for (const scopeName of requiredScopes) {
    const scope = manifest.scopes?.[scopeName];
    if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
      problems.push(`scope ${scopeName} is missing`);
      continue;
    }
    for (const key of ["databaseTestPaths", "fixtureSeedPaths", "seededTestPaths"]) {
      validateRelativePaths(scope[key], `${scopeName}.${key}`, problems);
    }
  }

  for (const scopeName of ["phase1", "phase2"]) {
    const names = manifest.scopes?.[scopeName]?.migrationNames;
    if (!uniqueStrings(names)) {
      problems.push(`${scopeName}.migrationNames must contain unique non-empty strings`);
      continue;
    }
    if (names.some((name) => !TIMESTAMPED_MIGRATION.test(name))) problems.push(`${scopeName}.migrationNames contains a non-timestamped name`);
    if (names[0] !== "20260815000000_pre_phase0_baseline.sql") problems.push(`${scopeName} must begin with the canonical baseline`);
  }

  const phase1 = manifest.scopes?.phase1?.migrationNames ?? [];
  const phase2 = new Set(manifest.scopes?.phase2?.migrationNames ?? []);
  for (const name of phase1) if (!phase2.has(name)) problems.push(`Phase 1 migration is absent from Phase 2 scope: ${name}`);
  if (manifest.scopes?.["reconciliation-applied"]?.migrationSelection !== "captured-ledger") {
    problems.push("reconciliation-applied must use captured-ledger selection");
  }
  if (manifest.scopes?.["reconciliation-full"]?.migrationSelection !== "phase2") {
    problems.push("reconciliation-full must use Phase 2 selection");
  }
  return problems;
}

export async function loadDatabaseGateScopeManifest(root) {
  const path = resolve(root, DATABASE_GATE_SCOPE_FILE);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`database-gate scope manifest is missing or invalid: ${DATABASE_GATE_SCOPE_FILE}`);
  }
  const problems = validateDatabaseGateScopeManifest(manifest);
  if (problems.length) throw new Error(`database-gate scope manifest failed validation: ${problems.join("; ")}`);
  return manifest;
}

export function scopeConfiguration(manifest, scopeName) {
  const scope = manifest.scopes?.[scopeName];
  if (!scope) throw new Error(`unsupported database-gate scope ${scopeName}`);
  return scope;
}
