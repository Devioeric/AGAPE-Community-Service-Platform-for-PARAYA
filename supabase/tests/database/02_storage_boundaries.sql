BEGIN;
SET LOCAL search_path = public, storage, extensions, pg_catalog;
SELECT plan(7);

CREATE TEMP TABLE expected_phase2_buckets(id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO expected_phase2_buckets(id) VALUES
 ('phase2-partnership-documents'),
 ('phase2-historical-evidence'),
 ('phase2-proposal-budget-evidence'),
 ('phase2-program-financial-evidence');

SELECT is(
 (SELECT count(*) FROM expected_phase2_buckets e WHERE NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id=e.id)),
 0::bigint,
 'all Phase 2 document buckets exist'
);
SELECT is(
 (SELECT count(*) FROM storage.buckets b JOIN expected_phase2_buckets e ON e.id=b.id WHERE b.public),
 0::bigint,
 'all Phase 2 document buckets are private'
);
SELECT is(
 (SELECT count(*) FROM storage.buckets b JOIN expected_phase2_buckets e ON e.id=b.id WHERE b.file_size_limit<>10485760),
 0::bigint,
 'all Phase 2 document buckets enforce the ten MiB limit'
);
SELECT is(
 (SELECT count(*) FROM storage.buckets b JOIN expected_phase2_buckets e ON e.id=b.id WHERE b.allowed_mime_types IS NULL OR cardinality(b.allowed_mime_types)<>5),
 0::bigint,
 'all Phase 2 document buckets use the reviewed MIME allowlist'
);
SELECT is(
 (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'phase2_documents_authenticated_%'),
 4::bigint,
 'four explicit Phase 2 storage object policies exist'
);
SELECT is(
 (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'phase2_documents_authenticated_%' AND permissive<>'RESTRICTIVE'),
 0::bigint,
 'every Phase 2 storage policy is restrictive'
);
SELECT is(
 (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'phase2_documents_authenticated_%' AND NOT ('authenticated'=ANY(roles))),
 0::bigint,
 'Phase 2 storage policies are scoped to authenticated identities and never anon'
);

SELECT * FROM finish();
ROLLBACK;
