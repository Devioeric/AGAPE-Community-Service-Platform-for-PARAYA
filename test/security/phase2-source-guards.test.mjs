import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("all Phase 2 server gates default off", async () => {
  const env = await read(".env.example");
  for (const key of ["AGAPE_PARTNER_REGISTRY_V2_ENABLED", "AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED", "AGAPE_PROPOSALS_V2_ENABLED", "AGAPE_PROGRAM_FINANCE_V2_ENABLED", "AGAPE_EXTERNAL_CONTACT_EMAIL_ENABLED"]) {
    assert.match(env, new RegExp(`^${key}=false$`, "m"));
  }
});

test("Phase 2 migrations are transactional, deny direct mutation, and revoke function execution", async () => {
  const files = [
    "supabase/migrations/20260818000100_phase2_partner_history_foundation.sql",
    "supabase/migrations/20260818000200_phase2_proposal_finance_foundation.sql",
    "supabase/migrations/20260818000300_phase2_security_and_core_rpcs.sql",
    "supabase/migrations/20260818000400_phase2_proposal_workflow_and_handoff.sql",
    "supabase/migrations/20260818000500_phase2_program_finance_rpcs.sql",
    "supabase/migrations/20260818000600_phase2_renewal_outbox.sql",
  ];
  for (const file of files) {
    const sql = await read(file);
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /COMMIT;/);
    assert.match(sql, /REVOKE/);
  }
  const history = await read(files[0]);
  assert.match(history, /historical_programs/);
  assert.match(history, /REVOKE INSERT,UPDATE,DELETE,TRUNCATE/);
  const rpcs = await read(files[2]);
  assert.match(rpcs, /REVOKE ALL ON FUNCTION public\.phase2_create_partner\(jsonb\) FROM PUBLIC,anon/);
  assert.match(rpcs, /phase2_current_has_capability/);
});

test("Phase 2 V2 routes use reviewed RPCs and never select star", async () => {
  for (const route of ["src/app/api/v2/partners/route.ts", "src/app/api/v2/historical-programs/route.ts"]) {
    const source = await read(route);
    assert.doesNotMatch(source, /select\(["'`]\*["'`]\)/);
    assert.match(source, /authorizeCapability/);
    assert.match(source, /\.rpc\(/);
  }
});

test("legacy proposal backfill uses the authoritative V1 timeline and does not invent counts", async () => {
  const sql = await read("supabase/migrations/20260818000200_phase2_proposal_finance_foundation.sql");
  assert.match(sql, /q\.timeline_start,q\.timeline_end,true/);
  assert.match(sql, /to_jsonb\(q\)->>'expected_beneficiary_count'/);
  assert.match(sql, /WHERE legacy_count\.value IS NOT NULL/);
  assert.doesNotMatch(sql, /q\.start_date|q\.end_date|q\.expected_beneficiary_count/);
});
