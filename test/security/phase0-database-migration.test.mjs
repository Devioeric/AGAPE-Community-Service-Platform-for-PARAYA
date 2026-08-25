import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260816000100_phase0_users_audit_hardening.sql",
  import.meta.url,
);
const activeAccountMigrationUrl = new URL(
  "../../supabase/migrations/20260816000150_phase0_active_account_rls.sql",
  import.meta.url,
);
const workflowMigrationUrl = new URL(
  "../../supabase/migrations/20260816000200_phase0_workflow_rls_hardening.sql",
  import.meta.url,
);

async function migration() {
  return readFile(migrationUrl, "utf8");
}

async function activeAccountMigration() {
  return readFile(activeAccountMigrationUrl, "utf8");
}

async function workflowMigration() {
  return readFile(workflowMigrationUrl, "utf8");
}

test("users self-update policy is paired with a privileged-column trigger", async () => {
  const sql = await migration();

  assert.match(sql, /CREATE POLICY "users can update own profile"[\s\S]+?TO authenticated/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.guard_users_privileged_columns\(\)/);
  assert.match(sql, /CREATE TRIGGER protect_users_privileged_columns/);
  assert.match(sql, /RAISE EXCEPTION[\s\S]+?account-governance fields/);
});

test("the self-service allowlist excludes account-governance fields", async () => {
  const sql = await migration();
  const allowlist = sql.match(
    /column_name <> ALL \(ARRAY\[([\s\S]+?)\]::text\[\]\)/,
  );

  assert.ok(allowlist, "migration must define an explicit self-service allowlist");
  for (const safeColumn of ["full_name", "phone", "notification_prefs", "updated_at"]) {
    assert.match(allowlist[1], new RegExp(`'${safeColumn}'`));
  }
  for (const protectedColumn of [
    "role",
    "status",
    "is_active",
    "permissions",
    "barangay_id",
    "org_name",
    "email",
  ]) {
    assert.doesNotMatch(allowlist[1], new RegExp(`'${protectedColumn}'`));
  }
});

test("audit history is read-only to authenticated admins and append-only to services", async () => {
  const sql = await migration();

  assert.match(sql, /DROP POLICY IF EXISTS "audit_admin_all"/);
  assert.match(sql, /CREATE POLICY "audit_admin_select"[\s\S]+?FOR SELECT/);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.audit_logs FROM authenticated/);
  assert.match(sql, /GRANT SELECT, INSERT ON public\.audit_logs TO service_role/);
  assert.match(sql, /CREATE TRIGGER audit_logs_append_only[\s\S]+?BEFORE UPDATE OR DELETE/);
});

test("Phase 0 migration is transactional and does not rewrite domain data", async () => {
  const sql = await migration();

  assert.match(sql, /^--[\s\S]*?\bBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE FROM|TRUNCATE TABLE)\s+public\./i);
});

test("inactive Auth identities are restricted across existing RLS-enabled public tables", async () => {
  const sql = await activeAccountMigration();

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.phase0_current_account_is_active\(\)/);
  assert.match(sql, /account\.status = 'active'/);
  assert.match(sql, /account\.is_active IS TRUE/);
  assert.match(sql, /relation\.relrowsecurity IS TRUE/);
  assert.match(sql, /relation\.relname <> 'users'/);
  assert.match(sql, /AS RESTRICTIVE FOR ALL TO authenticated/);
  assert.match(sql, /phase0_users_select_guard/);
  assert.match(sql, /id = \(SELECT auth\.uid\(\)\)[\s\S]+?status = 'pending'[\s\S]+?is_active IS FALSE/);
  assert.match(sql, /phase0_users_update_guard[\s\S]+?phase0_current_account_is_active/);
  assert.match(sql, /phase0_users_insert_guard[\s\S]+?WITH CHECK \(false\)/);
  assert.match(sql, /phase0_users_delete_guard[\s\S]+?USING \(false\)/);
  assert.match(sql, /COMMIT;\s*$/);
});

test("direct proposal workflow and ownership mutations are guarded below the API", async () => {
  const sql = await workflowMigration();

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.guard_phase0_workflow_columns\(\)/);
  assert.match(sql, /CREATE TRIGGER phase0_proposal_workflow_guard/);
  assert.match(sql, /New proposals must start as unreviewed drafts/);
  assert.match(sql, /Workflow-controlled columns cannot be changed through a generic update/);
  assert.match(sql, /phase0_project_proposals_insert_guard[\s\S]+?AS RESTRICTIVE[\s\S]+?status = 'draft'/);
  assert.match(sql, /phase0_project_proposals_update_guard[\s\S]+?status IN \('draft', 'revisions_requested'\)/);
  assert.match(sql, /phase0_project_proposals_delete_guard[\s\S]+?USING \(false\)/);
  assert.match(sql, /CREATE TRIGGER proposal_reviews_append_only[\s\S]+?BEFORE UPDATE OR DELETE/);
  assert.match(sql, /phase0_proposal_reviews_insert_guard[\s\S]+?WITH CHECK \(false\)/);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.proposal_reviews FROM authenticated/);
  assert.match(sql, /phase0_apply_proposal_workflow_change/);
  assert.match(sql, /status = p_expected_status/);
  assert.match(sql, /finance_clearance IS NOT DISTINCT FROM p_expected_finance_clearance/);
  assert.match(sql, /INSERT INTO public\.proposal_reviews/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.phase0_apply_proposal_workflow_change[\s\S]+?TO service_role/);
  assert.match(sql, /phase0_proposal_sdg_insert_guard/);
  assert.match(sql, /proposal\.status IN \('draft', 'revisions_requested'\)/);
  assert.match(sql, /phase0_update_proposal_content/);
  assert.match(sql, /FROM public\.project_proposals[\s\S]+?FOR UPDATE/);
  assert.match(sql, /DELETE FROM public\.proposal_sdg_alignment/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.phase0_update_proposal_content[\s\S]+?TO service_role/);
});

test("program write guards do not remove authenticated read access", async () => {
  const sql = await workflowMigration();

  assert.match(sql, /phase0_programs_insert_guard[\s\S]+?FOR INSERT/);
  assert.match(sql, /phase0_programs_update_guard[\s\S]+?FOR UPDATE/);
  assert.match(sql, /phase0_programs_delete_guard[\s\S]+?FOR DELETE/);
  assert.match(sql, /phase0_programs_delete_guard[\s\S]+?USING \(false\)/);
  assert.doesNotMatch(sql, /CREATE POLICY "phase0_programs_write_guard"[\s\S]+?FOR ALL/);
  assert.match(sql, /phase0_program_budgets_insert_guard[\s\S]+?FOR INSERT/);
  assert.match(sql, /phase0_program_budgets_update_guard[\s\S]+?FOR UPDATE/);
  assert.match(sql, /phase0_program_budgets_delete_guard[\s\S]+?FOR DELETE/);
  assert.match(sql, /phase0_program_budgets_delete_guard[\s\S]+?USING \(false\)/);
  assert.match(sql, /CREATE TRIGGER phase0_program_activity_workflow_guard/);
  assert.match(sql, /phase0_program_activities_insert_guard[\s\S]+?created_by = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /phase0_program_activities_update_guard[\s\S]+?FOR UPDATE/);
  assert.match(sql, /phase0_program_activities_delete_guard[\s\S]+?USING \(false\)/);
  assert.match(sql, /proposal_validation_stakeholders/);
  assert.match(sql, /phase0_trusted_write_only_insert[\s\S]+?WITH CHECK \(false\)/);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.%I FROM authenticated/);
  assert.match(sql, /phase0_household_profiles_select_guard/);
  assert.match(sql, /account\.role = 'paraya_researcher'/);
  assert.match(sql, /phase0_household_profiles_delete_guard[\s\S]+?USING \(false\)/);
  assert.match(sql, /ON storage\.objects[\s\S]+?phase0_current_account_is_active/);
});

test("program signups allow only safe volunteer self-service through direct RLS", async () => {
  const sql = await workflowMigration();
  const signupStart = sql.indexOf(
    'DROP POLICY IF EXISTS "phase0_program_signups_select_guard"',
  );
  const signupEnd = sql.indexOf(
    "-- Community-validation evidence",
    signupStart,
  );

  assert.match(sql, /'public\.program_signups'/);
  const confirmationColumn = sql.indexOf("ADD COLUMN IF NOT EXISTS confirmed_at timestamptz");
  const confirmationPreflight = sql.indexOf("DO $program_signup_column_check$");
  assert.ok(
    confirmationColumn >= 0 && confirmationColumn < confirmationPreflight,
    "the migration must add confirmation tracking before validating dependent guards",
  );
  assert.match(sql, /DO \$program_signup_column_check\$/);
  for (const requiredColumn of [
    "program_id",
    "volunteer_id",
    "approval_status",
    "signed_up_at",
    "confirmed_at",
    "approved_by",
    "approved_at",
    "approval_notes",
    "added_by",
  ]) {
    assert.match(sql, new RegExp(`'${requiredColumn}'`));
  }
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.phase0_current_account_is_active_volunteer\(\)/);
  assert.match(sql, /account\.status = 'active'[\s\S]+?account\.is_active IS TRUE[\s\S]+?account\.role = 'volunteer'/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.guard_phase0_program_signup_write\(\)/);
  assert.match(sql, /CREATE TRIGGER phase0_program_signup_write_guard[\s\S]+?BEFORE INSERT OR UPDATE/);
  assert.match(sql, /NEW\.status := 'pending'/);
  assert.match(sql, /NEW\.approval_status := 'approved'/);
  assert.match(sql, /NEW\.signed_up_at := now\(\)/);
  assert.match(sql, /column_name <> 'status'/);
  assert.match(sql, /NEW\.status IS DISTINCT FROM 'withdrawn'/);

  assert.ok(signupStart >= 0 && signupEnd > signupStart);
  const signupPolicies = sql.slice(signupStart, signupEnd);
  assert.match(signupPolicies, /phase0_program_signups_select_guard[\s\S]+?phase0_current_account_is_paraya/);
  assert.match(signupPolicies, /phase0_program_signups_insert_guard[\s\S]+?volunteer_id = \(SELECT auth\.uid\(\)\)[\s\S]+?status = 'pending'[\s\S]+?approval_status = 'approved'/);
  assert.match(signupPolicies, /phase0_program_signups_update_guard[\s\S]+?status IN \('pending', 'confirmed'\)[\s\S]+?status = 'withdrawn'/);
  assert.match(signupPolicies, /phase0_program_signups_delete_guard[\s\S]+?USING \(false\)/);
  assert.match(signupPolicies, /REVOKE DELETE, TRUNCATE ON public\.program_signups FROM authenticated/);
  const signupMutationPolicies = signupPolicies.slice(
    signupPolicies.indexOf('DROP POLICY IF EXISTS "phase0_program_signups_insert_guard"'),
  );
  assert.doesNotMatch(signupMutationPolicies, /phase0_current_account_is_paraya/);
  for (const deniedRole of ["admin", "office", "student_org", "department"]) {
    assert.doesNotMatch(signupPolicies, new RegExp(`'${deniedRole}'`));
  }

  assert.match(sql, /'program_budgets',[\s\S]+?'program_signups'[\s\S]+?phase0_active_account_guard/);
});
