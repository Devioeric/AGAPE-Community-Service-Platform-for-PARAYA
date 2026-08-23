import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) { return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8"); }

test("the forward completion migration closes the direct RPC trust boundary", async () => {
  const sql = await source("supabase/migrations/20260817000400_phase1_completion_gate.sql");
  assert.match(sql, /profiling_runtime_settings/);
  assert.match(sql, /mode text NOT NULL DEFAULT 'off' CHECK\(mode IN\('off','synthetic','live'\)\)/);
  assert.match(sql, /phase1_json_object_has_only/);
  assert.match(sql, /phase1_assert_resident_payload/);
  assert.match(sql, /derived minor requires guardian authorization/);
  assert.match(sql, /registered sample unit is unavailable/);
  assert.match(sql, /Mother Leaders may submit only their own assigned-sitio packages/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase1_profile_lifecycle_action/);
});

test("stable identities, lifecycle history, and atomic import cleanup are implemented", async () => {
  const sql = await source("supabase/migrations/20260817000400_phase1_completion_gate.sql");
  assert.match(sql, /household:=sample\.household_id/);
  assert.match(sql, /coalesce\(max\(rv\.version\),0\)\+1/);
  assert.match(sql, /phase1_begin_profiling_revision/);
  assert.match(sql, /phase1_apply_profile_lifecycle_action/);
  assert.match(sql, /profiling_household_memberships SET effective_to/);
  assert.match(sql, /phase1_resolve_profiling_duplicate_v2/);
  assert.match(sql, /FOR UPDATE;[\s\S]*batch is not ready/);
  assert.match(sql, /SET sanitized_data=NULL,row_key=NULL/);
  assert.match(sql, /status='committed'.*purged_at=now\(\)/);
});

test("setup remains available while collection and analytics stay runtime-gated", async () => {
  const cycles = await source("src/app/api/profiling/cycles/route.ts");
  const prefix = await source("src/app/api/profiling/configuration/prefix/route.ts");
  const submissions = await source("src/app/api/profiling/submissions/route.ts");
  assert.doesNotMatch(cycles, /isProfilingV2Enabled/);
  assert.doesNotMatch(prefix, /isProfilingV2Enabled/);
  assert.match(submissions, /isProfilingV2Enabled/);
});

test("profiling mutations use scoped cycle context and database-returned row versions", async () => {
  const create = await source("src/app/api/profiling/submissions/route.ts");
  const revise = await source("src/app/api/profiling/submissions/[id]/revise/route.ts");
  const preview = await source("src/app/api/profiling/imports/preview/route.ts");
  const workspace = await source("src/components/profiling/ProfilingWorkspace.tsx");
  for (const route of [create, revise, preview]) {
    assert.doesNotMatch(route, /createAdminClient/);
    assert.match(route, /getAuthorizedProfilingCycleContext/);
  }
  assert.match(create, /getProfilingSubmissionMutationDTO/);
  assert.match(revise, /getProfilingSubmissionMutationDTO/);
  assert.match(workspace, /expected_version: created\.rowVersion/);
  assert.doesNotMatch(workspace, /expected_version:\s*1/);
  assert.match(workspace, /expected_version: selectedCycle\.row_version/);
  assert.match(workspace, /deriveMinorStatus/);
  assert.doesNotMatch(workspace, /estimated_age < 18/);
  const parser = await source("src/lib/profiling/import-parser.ts");
  assert.match(parser, /resident_id:\s*String\(resident\.resident_id\)\.trim\(\)/);
});

test("the UI cannot assert minor status and Secretary approval requires detail review", async () => {
  const workspace = await source("src/components/profiling/ProfilingWorkspace.tsx");
  const contracts = await source("src/lib/profiling/contracts.ts");
  assert.doesNotMatch(workspace, /is_minor:\s*(resident|minor|event)/);
  assert.doesNotMatch(contracts, /is_minor:/);
  assert.match(workspace, /Review details/);
  assert.match(workspace, /Secretary detail review/);
});

test("legacy household evidence is redacted and new profiling links use completed aggregate snapshots", async () => {
  const links = await source("src/app/api/proposals/[id]/validation-links/route.ts");
  const print = await source("src/app/(dashboard)/officer/proposals/[id]/ppf/PpfClient.tsx");
  assert.doesNotMatch(links, /select\([^)]*head_of_household/);
  assert.match(links, /profiling_evidence_snapshot/);
  assert.match(links, /agape\.profiling\.aggregate\.v2/);
  assert.doesNotMatch(print, /d\.head_of_household/);
});

test("follow-up constraints are dropped before legacy statuses are rewritten", async () => {
  const sql = await source("supabase/migrations/20260817000300_phase1_domain_containment.sql");
  const drop = sql.indexOf("DROP CONSTRAINT IF EXISTS follow_up_records_status_check");
  const rewrite = sql.indexOf("UPDATE public.follow_up_records SET status='scheduled'");
  assert.ok(drop >= 0 && rewrite > drop);
});
