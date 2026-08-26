import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Phase 1 private Storage migration retires broad grants and enforces limits", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/20260818000820_phase1_private_storage_boundary.sql", import.meta.url), "utf8");
  for (const policy of ["Authenticated Upload Activity Photos", "Users View Own Activity Photos", "auth users can upload", "users view own files"]) {
    assert.ok(sql.includes(`DROP POLICY IF EXISTS \"${policy}\" ON storage.objects`));
  }
  assert.match(sql, /CREATE POLICY phase1_private_buckets_direct_guard[\s\S]*AS RESTRICTIVE FOR ALL TO authenticated/);
  assert.match(sql, /bucket_id NOT IN\('activity-photos','reports'\)/);
  assert.match(sql, /file_size_limit=10485760/);
  assert.match(sql, /application\/pdf/);
});
