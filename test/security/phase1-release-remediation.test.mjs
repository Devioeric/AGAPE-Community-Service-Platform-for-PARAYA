import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("release remediation is one forward-only transaction with fail-closed catalog verification", async () => {
  const sql = await source("supabase/migrations/20260817000410_phase1_release_gate_remediation.sql");
  assert.equal((sql.match(/^BEGIN;/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;/gm) ?? []).length, 1);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
  assert.match(sql, /public domain table % has no permission-module mapping/);
  assert.match(sql, /public domain table % does not have RLS enabled/);
  assert.match(sql, /phase1_deny_override_guard/);
  assert.match(sql, /p_table='chatbot_logs' THEN 'ai_assistance'/);
  for (const legacyTable of [
    "discussion_posts",
    "discussion_replies",
    "participation_forms",
    "qualitative_data",
    "skill_categories",
    "system_backups",
  ]) assert.match(sql, new RegExp(`'${legacyTable}'`));
  assert.ok(
    sql.indexOf("DO $enable_domain_rls$") < sql.indexOf("DO $install_deny_overrides$"),
    "authoritative legacy tables must fail closed before deny-only policies are installed",
  );
});

test("profiling RPC execution is deny-by-default and explicitly allowlisted", async () => {
  const sql = await source("supabase/migrations/20260817000410_phase1_release_gate_remediation.sql");
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.%I\(%s\) FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase1_create_profiling_submission_internal/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase1_resolve_profiling_duplicate_v2_internal/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.phase1_stage_profiling_import_v2/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.phase1_commit_profiling_import/);
});

test("resident versions and duplicate decisions are concurrency-safe and retained", async () => {
  const sql = await source("supabase/migrations/20260817000410_phase1_release_gate_remediation.sql");
  assert.match(sql, /profiling_resident_version_allocator/);
  assert.match(sql, /profiling_residents WHERE id=NEW\.resident_id FOR UPDATE/);
  assert.match(sql, /profiling_sample_single_replacement_key/);
  assert.match(sql, /duplicate batch is unavailable/);
  assert.match(sql, /SET left_reference='PURGED',right_reference='PURGED'/);
  assert.doesNotMatch(sql, /DELETE FROM public\.profiling_duplicate_candidates/);
});

test("every identifiable profiling read is runtime gated and audited", async () => {
  const sql = await source("supabase/migrations/20260817000410_phase1_release_gate_remediation.sql");
  for (const fn of ["phase1_get_profiling_submission", "phase1_get_import_batch", "phase1_list_profiling_submissions"]) {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`);
    assert.ok(start >= 0, `${fn} must be defined`);
    const body = sql.slice(start, sql.indexOf("$function$;", start));
    assert.match(body, /phase1_assert_profiling_runtime/);
  }
  assert.match(sql, /Resident profile viewed/);
  assert.match(sql, /Profiling import staging viewed/);
});

test("draft memberships become effective only after Secretary approval", async () => {
  const sql = await source("supabase/migrations/20260817000410_phase1_release_gate_remediation.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS activated_at timestamptz/);
  assert.match(sql, /phase1_activate_approved_memberships/);
  assert.match(sql, /NEW\.status='approved'/);
  assert.match(sql, /activated_at IS NOT NULL/);
});

test("remaining Admin APIs use canonical deny-aware capabilities", async () => {
  for (const [path, capability] of [
    ["src/app/api/admin/stats/route.ts", "admin.users.manage"],
    ["src/app/api/admin/backup-info/route.ts", "admin.recovery.read"],
    ["src/app/api/admin/backup/export/route.ts", "admin.recovery.read"],
    ["src/app/api/admin/backup/restore/route.ts", "admin.recovery.read"],
    ["src/app/api/users/route.ts", "admin.users.manage"],
  ]) {
    const route = await source(path);
    assert.match(route, /authorize(?:Any)?Capability/);
    assert.match(route, new RegExp(capability.replaceAll(".", "\\.")));
    assert.doesNotMatch(route, /self\?\.role\s*!==\s*["']admin["']/);
  }
});

test("actual wireframes visibly retire conflicting account and household flows", async () => {
  const partner = await source("docs/wireframes/partner.html");
  const auth = await source("docs/wireframes/auth.html");
  const admin = await source("docs/wireframes/admin.html");
  const officer = await source("docs/wireframes/officer.html");
  assert.match(partner, /Historical partner-account wireframe retired/);
  assert.match(partner, /body > \*:not\(\.agape-scope-notice\)/);
  assert.match(auth, /public registration is Volunteer-only/);
  assert.match(admin, /System Admin is infrastructure-only/);
  assert.match(officer, /household-only CRUD\/export.*retired/);
});
