import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  REQUIRED_AUTHORITATIVE_CATALOGS,
  REQUIRED_CAPTURE_FILES,
  containsCredentialLikeMaterial,
  sha256Buffer,
  validateAuthoritativeCapture,
  validateAuthoritativeEvidence,
  validateCatalogJson,
} from "../../scripts/lib/authoritative-evidence.mjs";
import { compareCatalogCaptures } from "../../scripts/lib/catalog-equivalence.mjs";

async function writeCapture(root, { applied = true, captureId = "AGAPE-CAPTURE-20260823", catalogCount = 1 } = {}) {
  const values = new Map();
  values.set("capture-metadata.json", JSON.stringify({
    schema: "agape.authoritative-capture.v1", captureId, environment: "production",
    projectReference: "agape_sanitized", capturedAt: "2026-08-23T10:00:00Z",
    operator: "Maria Santos (Database Operator)", postgresMajor: 15,
    supabaseCliVersion: "2.114.0", schemaAllowlist: ["public"],
    timestampedMigrationsApplied: applied,
  }));
  values.set("schema/public-schema.sql", "CREATE TABLE public.fixture (id uuid);\n");
  values.set("ledger/versions.txt", applied ? "20260816000100\n20260817000100\n" : "");
  for (const name of REQUIRED_CAPTURE_FILES.filter((name) => name.endsWith(".json") && name !== "capture-metadata.json")) {
    values.set(name, JSON.stringify({ captureId, objects: [{ stableIdentifier: name, count: catalogCount }] }));
  }
  for (const [name, value] of values) {
    const path = join(root, ...name.split("/"));
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, value);
  }
  const manifest = REQUIRED_CAPTURE_FILES.map((name) => `${sha256Buffer(Buffer.from(values.get(name)))}  ${name}`).join("\n");
  await writeFile(join(root, "manifest.sha256"), `${manifest}\n`);
}

test("catalog validation rejects malformed and credential-bearing JSON", () => {
  assert.match(validateCatalogJson(Buffer.from("no"), "bad.json").join("\n"), /valid JSON/);
  const secret = Buffer.from(JSON.stringify({ database_url: "postgresql://user:password@db.invalid/postgres" }));
  assert.match(validateCatalogJson(secret, "secret.json").join("\n"), /credential-like/);
  assert.equal(containsCredentialLikeMaterial("safe sanitized count"), false);
});

test("authoritative evidence reports hashes and counts without retaining contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "agape-authoritative-evidence-"));
  const schemaPath = join(root, "schema-only.sql");
  const ledgerPath = join(root, "migration-versions.txt");
  const catalogDirectory = join(root, "catalogs");
  await mkdir(catalogDirectory);
  await writeFile(schemaPath, "CREATE TABLE public.fixture (id uuid);\n");
  await writeFile(ledgerPath, "20260816000100\n20260817000100\n");
  for (const name of REQUIRED_AUTHORITATIVE_CATALOGS) {
    await writeFile(join(catalogDirectory, name), JSON.stringify([{ object: name, count: 1 }]));
  }

  const result = await validateAuthoritativeEvidence({ schemaPath, ledgerPath, catalogDirectory });
  assert.equal(result.valid, true);
  assert.equal(result.ledger.versions, 2);
  assert.equal(result.catalogs.length, REQUIRED_AUTHORITATIVE_CATALOGS.length);
  assert.equal(JSON.stringify(result).includes("CREATE TABLE"), false);
});

test("authoritative evidence fails closed when a required catalog is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "agape-authoritative-missing-"));
  const schemaPath = join(root, "schema-only.sql");
  const ledgerPath = join(root, "migration-versions.txt");
  await writeFile(schemaPath, "CREATE TABLE public.fixture (id uuid);\n");
  await writeFile(ledgerPath, "20260816000100\n");
  const result = await validateAuthoritativeEvidence({ schemaPath, ledgerPath, catalogDirectory: root });
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.includes("is missing")));
});

test("versioned authoritative capture validates manifest, metadata, and an explicitly empty ledger", async () => {
  const root = await mkdtemp(join(tmpdir(), "agape-authoritative-v1-"));
  await writeCapture(root, { applied: false });
  const result = await validateAuthoritativeCapture({ captureDirectory: root });
  assert.equal(result.valid, true, result.problems.join("; "));
  assert.equal(result.captureId, "AGAPE-CAPTURE-20260823");
  assert.equal(result.ledger.versions, 0);
  assert.equal(JSON.stringify(result).includes("CREATE TABLE"), false);
});

test("versioned authoritative capture rejects digest tampering and inconsistent ledger metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "agape-authoritative-tamper-"));
  await writeCapture(root, { applied: false });
  await writeFile(join(root, "ledger", "versions.txt"), "20260816000100\n");
  const result = await validateAuthoritativeCapture({ captureDirectory: root });
  assert.equal(result.valid, false);
  assert.match(result.problems.join("\n"), /digest mismatch|no timestamped migrations/i);
});

test("catalog equivalence emits hashes and reconciliation classifications without definitions", async () => {
  const authoritative = await mkdtemp(join(tmpdir(), "agape-catalog-authoritative-"));
  const replay = await mkdtemp(join(tmpdir(), "agape-catalog-replay-"));
  await writeCapture(authoritative, { captureId: "AGAPE-AUTHORITATIVE-20260823" });
  await writeCapture(replay, { captureId: "AGAPE-REPLAY-20260823" });
  const matched = await compareCatalogCaptures({ authoritativeCapture: authoritative, replayCapture: replay });
  assert.equal(matched.equivalent, true, matched.problems.join("; "));
  assert.equal(matched.counts.differences, 0);

  const drift = await mkdtemp(join(tmpdir(), "agape-catalog-drift-"));
  await writeCapture(drift, { captureId: "AGAPE-DRIFT-20260823", catalogCount: 2 });
  const changed = await compareCatalogCaptures({ authoritativeCapture: authoritative, replayCapture: drift });
  assert.equal(changed.equivalent, false);
  assert.ok(changed.rows.some((row) => row.classification === "Definition drift"));
  assert.equal(JSON.stringify(changed).includes('"count":2'), false);
});
