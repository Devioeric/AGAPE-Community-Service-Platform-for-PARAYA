import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Phase 2 runtime is target-bound and live mode requires attestations", async () => {
  const sql = await read("supabase/migrations/20260818000700_phase2_completion_remediation.sql");
  assert.match(sql, /phase2_assert_runtime\(p_component text,p_entity_id uuid DEFAULT NULL\)/);
  assert.match(sql, /phase2_release_attestations/);
  assert.match(sql, /live mode release attestations are incomplete/);
  assert.match(sql, /UPDATE public\.phase2_component_runtime SET mode='off'/);
});

test("proposal graph, budget snapshots, and handoff are frozen transaction boundaries", async () => {
  const sql = await read("supabase/migrations/20260818000720_phase2_proposal_budget_operations.sql");
  assert.match(sql, /phase2_save_proposal_graph/);
  assert.match(sql, /frozen_snapshot/);
  assert.match(sql, /phase2_proposal_snapshot/);
  const handoff = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.phase2_handoff_proposal"));
  assert.ok(handoff.indexOf("FOR UPDATE") < handoff.indexOf("SELECT * INTO existing FROM public.program_handoffs"), "handoff locks before checking idempotency");
  assert.doesNotMatch(sql, /proposal_id=proposal_id/);
});

test("program finance binds parents and itemizes liquidation claims", async () => {
  const sql = await read("supabase/migrations/20260818000730_phase2_program_finance_operations.sql");
  assert.match(sql, /doc\.program_id<>p_program_id/);
  assert.match(sql, /item\.item_kind<>'cash'/);
  assert.match(sql, /liquidation_expenditures/);
  assert.match(sql, /phase2_void_expenditure/);
});

test("V1 mutation endpoints consult the cutover authority", async () => {
  for (const path of [
    "src/app/api/proposals/route.ts",
    "src/app/api/proposals/[id]/route.ts",
    "src/app/api/proposals/[id]/advance/route.ts",
    "src/app/api/partnerships/route.ts",
    "src/app/api/partnerships/[id]/route.ts",
  ]) assert.match(await read(path), /guardV1Mutation/);
});

test("email delivery does not log contact addresses or provider bodies", async () => {
  const email = await read("src/lib/notifications/email.ts");
  assert.doesNotMatch(email, /msg\.to\)/);
  assert.doesNotMatch(email, /await res\.text/);
  const worker = await read("src/app/api/cron/phase2-contact-outbox/route.ts");
  assert.match(worker, /lease_expires_at/);
  assert.match(worker, /partner_contact_email_events/);
});

test("historical acceptance requires an explicit evidence-supported quality tier", async () => {
  const sql = await read("supabase/migrations/20260818000710_phase2_partner_history_operations.sql");
  assert.match(sql, /p_quality IS NULL OR p_quality NOT IN/);
  assert.match(sql, /quality is required for acceptance/);
  assert.match(sql, /quality exceeds the evidence-supported tier/);
});
