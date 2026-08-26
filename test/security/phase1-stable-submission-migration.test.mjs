import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../supabase/migrations/20260818000810_phase1_stable_submission_creation.sql", import.meta.url);

test("stable submission creation locks the sample and binds the generated household", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /FROM public\.profiling_sample_units[\s\S]*FOR UPDATE/);
  assert.match(sql, /sample unit already has a package; use the revision workflow/);
  assert.match(sql, /UPDATE public\.profiling_sample_units SET household_id=household\.id/);
  assert.match(sql, /reprofile package must preserve the complete active roster/);
  assert.match(sql, /resident identity is not linked to the selected household/);
  assert.match(sql, /SET search_path=pg_catalog,public/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase1_create_profiling_submission.*FROM PUBLIC,anon/);
  assert.match(sql, /phase1_revise_returned_profiling_submission_internal_v2/);
  assert.match(sql, /SET effective_to=effective_from[\s\S]*submission_id=previous\.id AND effective_to IS NULL/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase1_revise_returned_profiling_submission_internal_v2.*FROM PUBLIC,anon,authenticated/);
});
