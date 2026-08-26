import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = () => readFile(new URL(
  "../../supabase/migrations/20260818000800_phase1_effective_period_integrity.sql",
  import.meta.url,
), "utf8");

test("Phase 1 effective periods are half-open and overlap-safe", async () => {
  const sql = await migration();
  assert.match(sql, /^--[\s\S]*?\bBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /effective_to = effective_to \+ 1/);
  assert.match(sql, /daterange\(effective_from,effective_to,'\[\)'\)/);
  assert.match(sql, /profiling_activated_membership_no_overlap/);
  assert.match(sql, /profiling_resident_consent_no_overlap/);
  assert.match(sql, /effective_to=p_effective_on/);
  assert.doesNotMatch(sql, /p_effective_on-1|effective_to>=cycle\.collection_ends_on/);
  for (const fn of ["get_user_role", "handle_new_user", "get_user_barangay"]) {
    assert.match(sql, new RegExp(`ALTER FUNCTION public\\.${fn}\\(\\) SET search_path=pg_catalog,public`));
  }
  assert.match(sql, /DROP POLICY IF EXISTS "officers can delete survey_templates"/);
});

test("trusted lifecycle operations bind versions, targets, activation, and consent basis", async () => {
  const sql = await migration();
  assert.match(sql, /resident\.row_version<>p_expected_version/);
  assert.match(sql, /household\.row_version<>p_expected_version/);
  assert.match(sql, /target_household\.id=membership\.household_id/);
  assert.match(sql, /target_resident\.id=resident\.id/);
  assert.match(sql, /activated_at,activated_by/);
  assert.match(sql, /phase1_resident_is_minor_as_of/);
  assert.match(sql, /adult consent cannot use guardian authorization/);
  assert.match(sql, /profiling_lifecycle_events/);
});

test("aggregates select effective approved identities and preserve strict v2 output", async () => {
  const sql = await migration();
  assert.match(sql, /phase1_effective_resident_profiles/);
  assert.match(sql, /submission\.status='approved'/);
  assert.match(sql, /membership\.activated_at IS NOT NULL/);
  assert.match(sql, /cycle\.collection_ends_on<membership\.effective_to/);
  assert.match(sql, /consent\.status='granted'/);
  assert.match(sql, /'schemaVersion','agape\.profiling\.aggregate\.v2'/);
  assert.match(sql, /phase1_complementary_suppress/);
  assert.match(sql, /verified_at IS NOT NULL AND as_of_date<=cycle\.collection_ends_on/);
});

test("correction and context RPCs are complete-roster and allowlisted", async () => {
  const sql = await migration();
  assert.match(sql, /phase1_begin_same_cycle_correction/);
  assert.match(sql, /submission\.status<>'approved'/);
  assert.match(sql, /FROM public\.profiling_resident_versions version WHERE version\.submission_id=submission\.id/);
  assert.match(sql, /phase1_get_profiling_cycle_context/);
  assert.match(sql, /phase1_get_profiling_submission_mutation/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase1_get_profiling_cycle_context\(uuid\) FROM PUBLIC,anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.phase1_get_profiling_cycle_context\(uuid\) TO authenticated/);
});
