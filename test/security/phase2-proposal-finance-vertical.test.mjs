import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Packet 15 is a forward-only scoped migration", async () => {
  const [scope, sql] = await Promise.all([
    read("supabase/database-gate-scopes.json"),
    read("supabase/migrations/20260818000880_phase2_proposal_finance_vertical_completion.sql"),
  ]);
  assert.match(scope, /20260818000880_phase2_proposal_finance_vertical_completion\.sql/);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql, /UPDATE public\.phase2_component_runtime[\s\S]*mode='off'/);
  assert.match(sql, /UPDATE public\.phase2_cutover_state[\s\S]*write_authority='v1'/);
});

test("legacy graph and finance mutation RPCs are retired", async () => {
  const sql = await read("supabase/migrations/20260818000880_phase2_proposal_finance_vertical_completion.sql");
  for (const signature of [
    "phase2_save_proposal_graph(uuid,integer,jsonb)",
    "phase2_apply_proposal_action(uuid,text,integer,text,text[])",
    "phase2_handoff_proposal(uuid,integer)",
    "phase2_record_expenditure(uuid,jsonb)",
    "phase2_create_liquidation(uuid,jsonb,uuid[])",
  ]) assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature.replace(/[()[\]]/g, "\\$&")}[\\s\\S]*authenticated`));
});

test("trusted proposal warnings and planning estimates are database derived", async () => {
  const sql = await read("supabase/migrations/20260818000880_phase2_proposal_finance_vertical_completion.sql");
  assert.match(sql, /phase2_calculate_beneficiary_estimate/);
  assert.match(sql, /aggregate_schema_version='agape\.profiling\.aggregate\.v2'/);
  assert.match(sql, /suppressed cells are unavailable/);
  assert.match(sql, /phase2_proposal_required_warnings/);
  assert.match(sql, /warning acknowledgements do not match current trusted warnings/);
});

test("canonical snapshots use explicit fields and reproducible local hashes", async () => {
  const sql = await read("supabase/migrations/20260818000880_phase2_proposal_finance_vertical_completion.sql");
  const snapshot = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.phase2_proposal_snapshot"), sql.indexOf("CREATE OR REPLACE FUNCTION public.phase2_save_proposal_graph"));
  assert.doesNotMatch(snapshot, /to_jsonb\([a-z]+\)/i);
  assert.match(sql, /extensions\.digest\(convert_to\([^)]*::text,'UTF8'\),'sha256'\)/);
  assert.match(sql, /approved proposal snapshot hash is invalid/);
});

test("program allocation, expenditure variance, and liquidation claims are versioned", async () => {
  const sql = await read("supabase/migrations/20260818000880_phase2_proposal_finance_vertical_completion.sql");
  assert.match(sql, /phase2_prepare_program_allocation/);
  assert.match(sql, /phase2_apply_program_allocation_action/);
  assert.match(sql, /visible overspending requires a variance explanation/);
  assert.match(sql, /liquidation_claim_expenditure_parent_fk/);
  assert.match(sql, /liquidation expenditure identifiers must be unique/);
  assert.match(sql, /an expenditure is claimed by another liquidation/);
});

test("Phase 2 routes call only reviewed Packet 15 wrappers", async () => {
  const files = await Promise.all([
    read("src/app/api/v2/proposals/route.ts"),
    read("src/app/api/v2/proposals/[id]/workflow/route.ts"),
    read("src/app/api/v2/proposals/[id]/handoff/route.ts"),
    read("src/app/api/v2/programs/[id]/finance/expenditures/route.ts"),
    read("src/app/api/v2/programs/[id]/finance/liquidations/route.ts"),
  ]);
  const source = files.join("\n");
  assert.match(source, /phase2_save_proposal_graph_v2/);
  assert.match(source, /phase2_apply_proposal_action_v2/);
  assert.match(source, /phase2_handoff_proposal_v2/);
  assert.match(source, /phase2_record_expenditure_v2/);
  assert.match(source, /phase2_create_liquidation_v2/);
  assert.doesNotMatch(source, /\.from\([^)]*\)\.select\(["']\*["']\)/);
});

test("proposal and finance request contracts reject unknown fields", async () => {
  const contracts = await read("src/lib/phase2/contracts.ts");
  for (const name of [
    "proposalBeneficiaryEstimateSchema", "beneficiaryEstimateRequestSchema", "programAllocationPrepareSchema",
    "programAllocationActionSchema", "programExpenditureSchema", "liquidationUpdateSchema",
  ]) assert.match(contracts, new RegExp(`export const ${name} = (?:z\\.strictObject|liquidationCreateSchema\\.extend)`));
});
