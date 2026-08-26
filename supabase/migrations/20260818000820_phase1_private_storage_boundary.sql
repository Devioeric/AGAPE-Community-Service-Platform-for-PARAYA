-- Phase 1 release-gate correction: retire authoritative broad Storage grants
-- and make Phase 1 private buckets direct-client deny-by-default.
BEGIN;

DO $phase1_private_storage$
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Supabase Storage schema is required for the Phase 1 boundary';
  END IF;

  DROP POLICY IF EXISTS "Authenticated Upload Activity Photos" ON storage.objects;
  DROP POLICY IF EXISTS "Users View Own Activity Photos" ON storage.objects;
  DROP POLICY IF EXISTS "auth users can upload" ON storage.objects;
  DROP POLICY IF EXISTS "users view own files" ON storage.objects;
  DROP POLICY IF EXISTS phase1_private_buckets_direct_guard ON storage.objects;
  CREATE POLICY phase1_private_buckets_direct_guard ON storage.objects
    AS RESTRICTIVE FOR ALL TO authenticated
    USING(bucket_id NOT IN('activity-photos','reports'))
    WITH CHECK(bucket_id NOT IN('activity-photos','reports'));

  UPDATE storage.buckets
  SET public=false,file_size_limit=10485760,
      allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp']::text[]
  WHERE id='activity-photos';
  UPDATE storage.buckets
  SET public=false,file_size_limit=10485760,
      allowed_mime_types=ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg','image/png'
      ]::text[]
  WHERE id='reports';
END;
$phase1_private_storage$;

COMMIT;
