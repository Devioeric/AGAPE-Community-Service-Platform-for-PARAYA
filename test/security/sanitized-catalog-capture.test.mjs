import assert from "node:assert/strict";
import test from "node:test";
import { extractPublicCatalog, extractStorageBucketsFromDataDump, extractStoragePolicies, sanitizeStorageBuckets, splitSqlStatements } from "../../scripts/lib/sanitized-catalog-capture.mjs";

test("DDL splitting preserves function bodies containing semicolons", () => {
  const statements = splitSqlStatements(`CREATE FUNCTION public.f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM 1; END; $$;\nCREATE TABLE public.t (id uuid);`);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /PERFORM 1;/);
});

test("sanitized catalogs expose identifiers and hashes but no SQL definitions", () => {
  const catalog = extractPublicCatalog(`
    CREATE TABLE public.t (id uuid);
    ALTER TABLE ONLY public.t ADD CONSTRAINT t_pkey PRIMARY KEY (id);
    CREATE UNIQUE INDEX t_id ON public.t USING btree (id);
    CREATE FUNCTION public.f() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO public AS $$ SELECT 1; $$;
    CREATE TRIGGER tr AFTER INSERT ON public.t EXECUTE FUNCTION public.f();
    CREATE POLICY p ON public.t FOR SELECT USING (true);
    ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON TABLE public.t TO authenticated;
  `, `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;`);
  assert.equal(catalog.tablesColumns.length, 1);
  assert.equal(catalog.constraintsIndexes.length, 2);
  assert.equal(catalog.functions[0].securityMode, "definer");
  assert.equal(catalog.functions[0].configuredSearchPath, true);
  assert.equal(catalog.extensions[0].name, "pgcrypto");
  assert.doesNotMatch(JSON.stringify(catalog), /SELECT 1|PRIMARY KEY|USING \(true\)/);
});

test("Storage sanitizer allowlists metadata and rejects unsafe bucket names", () => {
  const buckets = sanitizeStorageBuckets([{ id: "private-docs", public: false, owner: "discard", file_size_limit: 10485760, allowed_mime_types: ["application/pdf"] }]);
  assert.deepEqual(buckets[0], {
    stableIdentifier: "storage.bucket.private-docs", name: "private-docs", public: false,
    fileSizeLimit: 10485760, allowedMimeTypes: ["application/pdf"],
  });
  assert.throws(() => sanitizeStorageBuckets([{ id: "../unsafe" }]), /unsafe/);
  const policies = extractStoragePolicies("CREATE POLICY p ON storage.objects FOR SELECT USING (true); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;");
  assert.equal(policies.length, 1);
});

test("Storage bucket COPY parsing emits only allowlisted metadata", () => {
  const dump = 'COPY "storage"."buckets" ("id", "name", "owner", "public", "file_size_limit", "allowed_mime_types") FROM stdin;\nprivate-docs\tprivate-docs\tignored-owner\tf\t10485760\t{application/pdf}\n\\.\n';
  assert.deepEqual(extractStorageBucketsFromDataDump(dump), [{
    stableIdentifier: "storage.bucket.private-docs", name: "private-docs", public: false,
    fileSizeLimit: 10485760, allowedMimeTypes: ["application/pdf"],
  }]);
  assert.doesNotMatch(JSON.stringify(extractStorageBucketsFromDataDump(dump)), /ignored-owner/);
});
