import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Partner vertical operations are versioned, target-bound, and append-only", async () => {
  const sql = await read("supabase/migrations/20260818000860_phase2_partner_vertical_completion.sql");
  assert.match(sql, /phase2_update_partner_contact/);
  assert.match(sql, /partner-primary:/);
  assert.match(sql, /promote another active contact instead of removing the only primary/);
  assert.match(sql, /phase2_transition_partnership_term/);
  assert.match(sql, /phase2_merge_partner/);
  assert.match(sql, /merge target is incompatible/);
  assert.match(sql, /phase2_upsert_partnership_need/);
  assert.match(sql, /evidence is not authorized for this Partner/);
  assert.match(sql, /phase2_configure_partner_type_policy/);
  assert.match(sql, /p_effective_from<current_date/);
});

test("legacy sign-off preserves accounts unless disposable synthetic suspension is explicitly enabled", async () => {
  const sql = await read("supabase/migrations/20260818000860_phase2_partner_vertical_completion.sql");
  const preservation = await read("supabase/migrations/20260818000910_phase2_solo_development_account_preservation.sql");
  const route = await read("src/app/api/v2/legacy-partner-mappings/[userId]/route.ts");
  assert.match(sql, /auth_suspension_status/);
  assert.match(sql, /next_status:=CASE p_action WHEN 'start_review' THEN 'in_review' WHEN 'approve' THEN 'approved' ELSE 'signed_off' END/);
  assert.match(sql, /phase2_finalize_legacy_auth_suspension/);
  const prepare = sql.slice(sql.indexOf("phase2_reconcile_legacy_partner_mapping_v2"), sql.indexOf("phase2_finalize_legacy_auth_suspension"));
  assert.doesNotMatch(prepare, /UPDATE public\.users SET status='suspended'/);
  assert.match(route, /AGAPE_LEGACY_ACCOUNT_SUSPENSION_ENABLED/);
  assert.match(route, /!testSuspensionEnabled \|\| prepared\.dataMode !== "synthetic"/);
  assert.match(route, /accountPreserved: true/);
  assert.match(route, /auth_admin_update_failed/);
  assert.match(route, /phase2_finalize_legacy_auth_suspension/);
  assert.match(route, /await admin\.rpc\("phase2_finalize_legacy_auth_suspension"/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.phase2_finalize_legacy_auth_suspension\(uuid,uuid,uuid,boolean,text\) TO service_role/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase2_finalize_legacy_auth_suspension\(uuid,uuid,uuid,boolean,text\) FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(route, /suspended\.error\.message|JSON\.stringify\(suspended\.error/);
  assert.match(preservation, /runtime_mode<>'synthetic'/);
  assert.match(preservation, /legacy_user\.is_synthetic_test IS NOT TRUE/);
  assert.match(preservation, /p_legacy_user_id=ANY\(allowed_users\)/);
  assert.match(preservation, /only allowlisted disposable synthetic accounts may be suspended/);
});

test("Partner APIs expose strict lifecycle operations without direct table writes", async () => {
  const paths = [
    "src/app/api/v2/partners/[id]/contacts/[contactId]/route.ts",
    "src/app/api/v2/partners/[id]/terms/[termId]/transition/route.ts",
    "src/app/api/v2/partners/[id]/merge/route.ts",
    "src/app/api/v2/partners/[id]/needs/route.ts",
    "src/app/api/v2/partners/policies/route.ts",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /authorizeCapability/);
    assert.match(source, /isPhase2ComponentEnabled\("partners"\)/);
    assert.match(source, /\.rpc\("phase2_/);
    assert.doesNotMatch(source, /\.from\(/);
  }
});
