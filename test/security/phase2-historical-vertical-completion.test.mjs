import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20260818000870_phase2_historical_vertical_completion.sql");

test("historical graph mutations use immutable snapshots and version-returning RPCs", () => {
  assert.match(sql, /phase2_historical_snapshot\(p_id uuid\)/);
  assert.match(sql, /phase2_update_historical_program_v2\(p_id uuid,p_expected_version integer,p_payload jsonb\)/);
  assert.match(sql, /'partner_ids'.*'barangay_ids'.*'need_ids'.*'sdgs'/s);
  assert.match(sql, /quality exceeds the evidence-supported tier/);
  assert.match(read("src/app/api/v2/historical-programs/[id]/route.ts"), /p_payload: payload/);
  assert.doesNotMatch(read("src/app/api/v2/historical-programs/[id]/route.ts"), /p_changes/);
});

test("historical detail is staff-only while aggregates remain scoped and separated", () => {
  assert.match(sql, /aggregate-only historical access/g);
  assert.match(sql, /agape\.historical-programs\.aggregate\.v2/);
  assert.match(sql, /'verifiedHistorical'/);
  assert.match(sql, /'unverifiedHistorical'/);
  assert.match(sql, /actor\.barangay_id IS NULL.*barangay scope is required/s);
  assert.doesNotMatch(read("src/app/api/v2/historical-programs/analytics/route.ts"), /createAdminClient|select\(\s*["']\*["']/);
});

test("historical imports retain one immutable resolution and purge staging", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.historical_program_import_resolutions/);
  assert.match(sql, /import_row_id uuid NOT NULL UNIQUE/);
  assert.match(sql, /historical_import_resolutions_immutable/);
  assert.match(sql, /phase2_resolve_historical_duplicate_v2/);
  assert.match(sql, /status='committed'.*created_count=v_created_count.*linked_count=v_linked_count.*excluded_count=v_excluded_count/s);
  assert.match(sql, /sanitized_data=NULL,row_key='purged-'/);
  assert.match(sql, /DELETE FROM public\.historical_program_duplicate_decisions/);
});

test("historical templates and preview share strict Programs, SDG, and Need catalogs", () => {
  const parser = read("src/lib/phase2/historical-import.ts");
  assert.match(parser, /HISTORICAL_NEED_HEADERS/);
  assert.match(parser, /Duplicate import header after normalization/);
  assert.match(parser, /Unknown import column/);
  assert.match(parser, /workbook\.Sheets\.Needs/);
  assert.match(parser, /buildHistoricalCsvTemplate/);
  const preview = read("src/app/api/v2/historical-programs/imports/preview/route.ts");
  assert.match(preview, /needs_csv/);
  assert.match(preview, /Replacement batch ID is invalid/);
});

test("obsolete weaker historical mutation RPCs are no longer caller executable", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase2_update_historical_program\(uuid,integer,jsonb\) FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase2_review_historical_program\(uuid,text,integer,text,text\) FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase2_resolve_historical_duplicate\(uuid,text,uuid,text,text\) FROM PUBLIC,anon,authenticated/);
});
