import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Phase 2 runtime and cutover state fail closed with component-specific authority", async () => {
  const sql = await read("supabase/migrations/20260818000850_phase2_runtime_isolation_corrections.sql");
  assert.match(sql, /phase2_component_manage_capability/);
  assert.match(sql, /WHEN 'proposals' THEN 'proposal\.catalog\.manage'/);
  assert.match(sql, /WHEN 'program_finance' THEN 'budget\.category\.manage'/);
  assert.match(sql, /coalesce\(\(SELECT c\.write_authority='v1'[\s\S]*\),false\)/);
  assert.doesNotMatch(sql, /phase2_v1_writes_allowed[\s\S]{0,400},true\)/);
  assert.match(sql, /target is not synthetic-allowlisted/);
  assert.match(sql, /synthetic mode requires user and entity allowlists/);
  assert.match(sql, /UPDATE public\.phase2_component_runtime[\s\S]*mode='off'/);
  assert.match(sql, /UPDATE public\.phase2_cutover_state[\s\S]*write_authority='v1'/);
});

test("Phase 2 imports, handoff, documents, and historical DTO stay root-bound", async () => {
  const sql = await read("supabase/migrations/20260818000850_phase2_runtime_isolation_corrections.sql");
  assert.match(sql, /historical_program_import_batches ADD COLUMN IF NOT EXISTS data_mode/);
  assert.match(sql, /replacement batch lineage is invalid/);
  assert.match(sql, /duplicate candidate mode mismatch/);
  assert.match(sql, /programs ADD COLUMN IF NOT EXISTS project_proposal_id uuid/);
  assert.match(sql, /FOREIGN KEY\(project_proposal_id\) REFERENCES public\.project_proposals\(id\)/);
  assert.match(sql, /legacy and project proposal references cannot coexist/);
  assert.match(sql, /FOREIGN KEY\(program_id,proposal_id\) REFERENCES public\.programs\(id,project_proposal_id\)/);
  assert.match(sql, /handoff component modes do not match the approved proposal/);
  assert.match(sql, /document path is not server-derived/);
  assert.match(sql, /PERFORM public\.phase2_assert_runtime\(component,parent_id\)/);
  const detail = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.phase2_get_historical_program"));
  assert.match(detail, /'occurredAt',e\.occurred_at/);
  assert.doesNotMatch(detail.slice(0, detail.indexOf("CREATE OR REPLACE FUNCTION public.phase2_purge_historical_imports")), /to_jsonb\(h\)|e\.created_at/);
});

test("runtime APIs use the canonical per-component capability map", async () => {
  const feature = await read("src/lib/phase2/feature.ts");
  const runtime = await read("src/app/api/v2/runtime/[component]/route.ts");
  const cutover = await read("src/app/api/v2/runtime/[component]/cutover/route.ts");
  assert.match(feature, /PHASE2_COMPONENT_MANAGE_CAPABILITY/);
  assert.match(runtime, /authorizeCapability\(PHASE2_COMPONENT_MANAGE_CAPABILITY\[component\.data\]\)/);
  assert.match(cutover, /authorizeCapability\(PHASE2_COMPONENT_MANAGE_CAPABILITY\[component\.data\]\)/);
});

test("document uploads derive their path from parent and content hash", async () => {
  const route = await read("src/app/api/v2/documents/[kind]/route.ts");
  const documents = await read("src/lib/phase2/documents.ts");
  assert.match(route, /generatedDocumentPath\(parentId, checked\.extension, checked\.sha256\)/);
  assert.match(documents, /sha256\?\.match\(\/\^\[0-9a-f\]\{64\}\$\//);
});
