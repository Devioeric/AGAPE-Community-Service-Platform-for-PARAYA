import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  REQUIRED_AUTHORITATIVE_CATALOGS,
  containsCredentialLikeMaterial,
  validateAuthoritativeEvidence,
  validateCatalogJson,
} from "../../scripts/lib/authoritative-evidence.mjs";

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
