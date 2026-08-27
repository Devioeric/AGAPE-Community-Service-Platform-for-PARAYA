import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("public signup never enumerates Auth users", async () => {
  const route = await source("src/app/api/auth/signup/route.ts");

  assert.doesNotMatch(route, /\.listUsers\s*\(/);
});

test("public signup never resets a submitted existing account password", async () => {
  const route = await source("src/app/api/auth/signup/route.ts");

  assert.doesNotMatch(
    route,
    /updateUserById\s*\([\s\S]{0,500}?password\s*[,}]/,
    "signup may ban the newly created pending account, but it must not update an existing account password",
  );
});

test("invitation acceptance does not directly self-activate public.users", async () => {
  const page = await source("src/app/accept-invite/page.tsx");
  assert.match(page, /useMemo\(\(\) => createClient\(\), \[\]\)/);
  assert.match(page, /verifiedSession\.current/);
  assert.match(page, /inviteType !== "invite"/);
  assert.match(page, /supabase\.auth\.setSession\(\{ access_token: accessToken, refresh_token: refreshToken \}\)/);

  assert.doesNotMatch(page, /\.from\(["']users["']\)[\s\S]{0,300}?status\s*:\s*["']active["']/);
  assert.doesNotMatch(page, /\.from\(["']users["']\)[\s\S]{0,300}?is_active\s*:\s*true/);
});

test("invitation middleware uses the narrow database proof instead of pending-row access", async () => {
  const middleware = await source("src/middleware.ts");
  const migration = await source("supabase/migrations/20260818000920_phase1_invitation_completion_boundary.sql");

  assert.match(middleware, /rpc\(\s*["']phase0_current_invite_can_complete["']/);
  assert.doesNotMatch(middleware, /isPendingInvitedAccount/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, public, auth/);
  assert.match(migration, /identity\.id = auth\.uid\(\)/);
  assert.match(migration, /identity\.invited_at IS NOT NULL/);
  assert.match(migration, /account\.status = 'pending'/);
  assert.match(migration, /account\.is_active IS FALSE/);
  assert.match(migration, /'finance_officer'/);
  assert.doesNotMatch(migration, /'finance'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase0_current_invite_can_complete\(\) FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase0_current_invite_can_complete\(\) FROM anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.phase0_current_invite_can_complete\(\) TO authenticated/);
});

test("generic proposal writes do not spread request metadata into database mutations", async () => {
  const collection = await source("src/app/api/proposals/route.ts");
  const item = await source("src/app/api/proposals/[id]/route.ts");

  assert.match(collection, /parseProposalCreateInput\s*\(\s*body\s*\)/);
  assert.match(item, /parseProposalUpdateInput\s*\(\s*body\s*\)/);
  assert.doesNotMatch(collection, /\.insert\s*\(\s*\{\s*\.\.\.body/);
  assert.doesNotMatch(item, /\.update\s*\(\s*\{\s*\.\.\.body/);
  assert.match(item, /phase0_update_proposal_content/);
  assert.doesNotMatch(item, /proposal_sdg_alignment["']\)\.delete/);
  assert.match(collection, /auth\.supabase\.rpc\("proposal_create_draft_graph"/);
  assert.doesNotMatch(collection, /\.from\("(?:project_proposals|proposal_sdg_alignment|proposal_validation_links)"\)\.(?:insert|delete)/);
});

test("generic program creation does not spread the request body into an insert", async () => {
  const route = await source("src/app/api/programs/route.ts");

  assert.doesNotMatch(route, /\.insert\s*\(\s*\{\s*\.\.\.body/);
});

test("program activity writes use strict contracts and preserve history", async () => {
  const collection = await source("src/app/api/programs/[id]/activities/route.ts");
  const item = await source("src/app/api/programs/[id]/activities/[actId]/route.ts");

  assert.match(collection, /parseProgramActivityCreateInput\s*\(\s*body\s*\)/);
  assert.match(item, /parseProgramActivityUpdateInput\s*\(\s*body\s*\)/);
  assert.match(collection, /authorizeCapability\("program\.manage"\)/);
  assert.match(item, /authorizeCapability\("program\.manage"\)/);
  assert.doesNotMatch(collection, /isPartner|isStaffOrAdmin/);
  assert.doesNotMatch(collection, /\.insert\s*\(\s*\{\s*\.\.\.body/);
  assert.doesNotMatch(item, /\.update\s*\(\s*\{\s*\.\.\.body/);
  assert.match(item, /export async function DELETE\(\)[\s\S]+?status:\s*405/);
  assert.doesNotMatch(item, /\.from\(["']program_activities["']\)\.delete\s*\(/);
});

test("backup restore commit is disabled and cannot invoke the service role", async () => {
  const route = await source("src/app/api/admin/backup/restore/route.ts");

  assert.match(route, /body\.mode === ["']commit["']/);
  assert.match(route, /restore_commit_disabled/);
  assert.doesNotMatch(route, /createAdminClient/);
  assert.doesNotMatch(route, /\.upsert\s*\(/);
});

test("plaintext full backup export is disabled", async () => {
  const route = await source("src/app/api/admin/backup/export/route.ts");

  assert.match(route, /backup_export_disabled/);
  assert.doesNotMatch(route, /createAdminClient/);
  assert.doesNotMatch(route, /BACKUP_TABLES/);
});

test("audit helper checks returned database errors", async () => {
  const audit = await source("src/lib/audit/log.ts");

  assert.match(audit, /const \{ error \} = await/);
  assert.match(audit, /if \(error\)/);
  assert.match(audit, /return false/);
  assert.match(audit, /return true/);
});

test("sensitive account mutations fail closed when the audit trail is unavailable", async () => {
  const directCreate = await source("src/app/api/admin/users/create/route.ts");
  const invite = await source("src/app/api/admin/invite/route.ts");
  const acceptInvite = await source("src/app/api/auth/accept-invite/route.ts");
  const signOut = await source("src/app/api/auth/signout/route.ts");
  const accountUpdate = await source("src/app/api/users/[id]/route.ts");
  const password = await source("src/app/api/users/[id]/password/route.ts");

  for (const route of [directCreate, invite, acceptInvite, accountUpdate, password]) {
    assert.match(route, /audit_unavailable/);
    assert.match(route, /const auditIntentRecorded = await recordAudit/);
    assert.match(route, /if \(!auditIntentRecorded\)/);
  }
  assert.match(signOut, /supabase\.auth\.signOut\(\{ scope: "global" \}\)/);
  assert.match(signOut, /supabase\.auth\.getUser\(\)/);
  assert.match(signOut, /const body = await request\.text\(\)/);
  assert.match(signOut, /"cache-control": "no-store"/);

  assert.ok(
    directCreate.indexOf("auditIntentRecorded") < directCreate.indexOf("auth.admin.createUser"),
    "direct account creation must persist intent before creating the Auth identity",
  );
  assert.ok(
    invite.indexOf("auditIntentRecorded") < invite.indexOf("auth.admin.inviteUserByEmail"),
    "account invitation must persist intent before sending the invite",
  );
  assert.ok(
    acceptInvite.indexOf("auditIntentRecorded") < acceptInvite.indexOf('.from("users")\n    .update'),
    "invite activation must persist intent before changing status",
  );
  assert.ok(
    accountUpdate.indexOf("auditIntentRecorded") < accountUpdate.indexOf("auth.admin.updateUserById"),
    "account governance changes must persist intent before changing Auth",
  );
  assert.ok(
    password.indexOf("Admin password change requested") < password.indexOf("password: body.password"),
    "direct password changes must persist intent before changing Auth",
  );
  assert.ok(
    password.indexOf("Password reset email requested") < password.indexOf("auth.resetPasswordForEmail"),
    "reset emails must persist intent before sending",
  );
});

test("proposal decisions use one expected-state workflow transaction", async () => {
  const route = await source("src/app/api/proposals/[id]/advance/route.ts");

  assert.match(route, /phase0_apply_proposal_workflow_change/);
  assert.match(route, /p_expected_status:\s*currentStatus/);
  assert.match(route, /p_expected_finance_clearance:\s*expectedFinanceClearance/);
  assert.match(route, /decision:\s*["']submitted["']/);
  assert.match(route, /decision:\s*["']prescreening_failed["']/);
  assert.doesNotMatch(route, /\.from\(["']project_proposals["']\)\s*\.update/);
  assert.doesNotMatch(route, /\.from\(["']proposal_reviews["']\)\s*\.insert/);
});

test("former institutional logins cannot mutate validation or volunteer data", async () => {
  const validations = await source("src/app/api/proposals/[id]/validations/route.ts");
  const links = await source("src/app/api/proposals/[id]/validation-links/route.ts");
  const evidence = await source("src/app/api/proposals/[id]/validations/[vid]/evidence/route.ts");
  const signup = await source("src/app/api/programs/[id]/signup/route.ts");
  const lookup = await source("src/app/api/users/lookup/route.ts");
  const roster = await source("src/app/api/partner/volunteers/route.ts");

  for (const route of [validations, evidence]) {
    assert.match(route, /authorizeCapability\("proposal\.validation\.record"\)/);
    assert.doesNotMatch(route, /isStaffOrAdmin/);
    assert.doesNotMatch(route, /created_by\s*===\s*user\.id/);
  }
  assert.match(links, /authorizeCapability\("proposal\.validation\.record"\)/);
  assert.match(links, /proposal\.barangay_id !== auth\.actor\.barangayId/);
  assert.doesNotMatch(links, /isStaffOrAdmin|created_by\s*===\s*user\.id/);
  assert.match(signup, /authorizeAnyCapability\(\["volunteer\.self", "volunteer\.manage"\]\)/);
  assert.doesNotMatch(signup, /isPartner/);
  assert.match(lookup, /authorizeCapability\("volunteer\.directory\.read"\)/);
  assert.doesNotMatch(lookup, /isPartner/);
  assert.match(roster, /partner_roster_retired/);
  assert.doesNotMatch(roster, /createAdminClient/);
});

test("volunteer signup uses a safe insert and one-way direct withdrawal", async () => {
  const route = await source("src/app/api/programs/[id]/signup/route.ts");

  assert.match(route, /parseProgramSignupRequestBody\(await request\.text\(\)\)/);
  assert.match(route, /const confirmedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(route, /status: "confirmed"[\s\S]+?confirmed_at: confirmedAt[\s\S]+?approved_by: userId[\s\S]+?approved_at: confirmedAt/);
  assert.match(route, /const \{ data, error \} = await supabase[\s\S]+?\.from\("program_signups"\)[\s\S]+?\.insert\(\{/);
  assert.match(route, /existing\?\.status === "withdrawn"[\s\S]+?createAdminClient\(\)[\s\S]+?\.eq\("status", "withdrawn"\)/);
  assert.match(route, /\.update\(\{ status: "withdrawn" \}\)[\s\S]+?\.in\("status", \["pending", "confirmed"\]\)/);
});

test("the obsolete cross-kind validation queue is retired", async () => {
  const route = await source("src/app/api/validations/route.ts");

  assert.match(route, /legacy_validation_queue_retired/);
  assert.match(route, /export async function GET\(\)[\s\S]+?retiredValidationQueue/);
  assert.match(route, /export async function POST\(\)[\s\S]+?retiredValidationQueue/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /createAdminClient|isStaffOrAdmin/);
  assert.doesNotMatch(route, /\.from\(/);
});

test("proposal validation evidence hard deletion is disabled", async () => {
  const validation = await source("src/app/api/proposals/[id]/validations/[vid]/route.ts");
  const link = await source("src/app/api/proposals/[id]/validation-links/[lid]/route.ts");
  const evidence = await source("src/app/api/proposals/[id]/validations/[vid]/evidence/route.ts");

  assert.match(validation, /validation_delete_disabled/);
  assert.match(link, /validation_link_delete_disabled/);
  assert.match(evidence, /validation_evidence_delete_disabled/);
});

test("legacy identifiable household profiles fail closed for broad and unscoped roles", async () => {
  const collection = await source("src/app/api/household-profiles/route.ts");
  const item = await source("src/app/api/household-profiles/[id]/route.ts");

  assert.match(collection, /authorizeCapability\("profiling\.detail\.read"\)/);
  assert.match(collection, /LEGACY_SAFE_FIELDS/);
  assert.doesNotMatch(collection, /select\("\*/);
  assert.match(collection, /recordAudit/);
  assert.match(item, /authorizeCapability\("profiling\.collect"\)/);
  assert.match(item, /household_profile_delete_disabled/);
});

test("program detail never returns volunteer PII to former partner roles", async () => {
  const route = await source("src/app/api/programs/[id]/route.ts");

  assert.doesNotMatch(route, /isPartner/);
  assert.match(route, /includeVolunteerPii/);
  assert.match(route, /hasCapability\(auth\.actor\.role, auth\.actor\.permissions, "volunteer\.directory\.read"\)/);
});

test("program and budget history cannot be hard-deleted", async () => {
  const program = await source("src/app/api/programs/[id]/route.ts");
  const budget = await source("src/app/api/programs/[id]/budget/route.ts");

  assert.match(program, /program_delete_disabled/);
  assert.doesNotMatch(program, /\.from\(["']programs["']\)\.delete/);
  assert.match(budget, /program_budget_delete_disabled/);
  assert.doesNotMatch(
    budget,
    /\.from\(["']program_budgets["']\)[\s\S]{0,100}?\.delete/,
  );
});
