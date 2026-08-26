import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("submission-detail correction enforces runtime, scope, fixed DTOs, comparison, and audit", async () => {
  const source = await readFile(new URL("../../supabase/migrations/20260818000830_phase1_submission_detail_boundary.sql", import.meta.url), "utf8");
  assert.match(source, /SECURITY DEFINER\s+SET search_path=pg_catalog,public/i);
  assert.match(source, /phase1_assert_profiling_runtime\(cycle\.barangay_id\)/);
  assert.match(source, /phase1_assert_profiling_scope\('profiling\.detail\.read'/);
  assert.match(source, /'household_code',household_code/);
  assert.match(source, /'consents',consents/);
  assert.match(source, /'previous',previous/);
  assert.match(source, /INSERT INTO public\.audit_logs/);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.phase1_get_profiling_submission\(uuid\) FROM PUBLIC,anon/);
  assert.doesNotMatch(source, /to_jsonb\s*\(/i);
});
