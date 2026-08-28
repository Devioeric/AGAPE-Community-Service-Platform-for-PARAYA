import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) { return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8"); }

test("Admin is confined to the infrastructure portal", async () => {
  const middleware = await source("src/middleware.ts");
  const sidebar = await source("src/components/layout/Sidebar.tsx");
  const capability = await source("src/lib/auth/capabilities.ts");
  assert.doesNotMatch(middleware, /ADMIN_PREFIXES/);
  assert.doesNotMatch(sidebar, /Switch portal/);
  const adminDefaults = capability.match(/admin:\s*\[([^\]]+)\]/)?.[1] ?? "";
  assert.match(adminDefaults, /"admin\.users\.manage"/);
  assert.match(adminDefaults, /"admin\.audit\.read"/);
  assert.match(adminDefaults, /"admin\.recovery\.read"/);
  assert.match(adminDefaults, /"integrity\.provider\.manage"/);
  assert.match(adminDefaults, /"communication\.provider\.manage"/);
  assert.doesNotMatch(adminDefaults, /proposal\.|program\.|profiling\.|budget\.|impact\.|volunteer\./);
});

test("legacy profiling and raw household analytics are read-only or retired", async () => {
  const collection = await source("src/app/api/household-profiles/route.ts");
  const item = await source("src/app/api/household-profiles/[id]/route.ts");
  const crossTab = await source("src/app/api/analytics/cross-tab/route.ts");
  const chatbot = await source("src/lib/ai/chatbot-query-router.ts");
  assert.match(collection, /legacy_unverified/);
  assert.match(collection, /status:\s*410/);
  assert.match(item, /status:\s*410/);
  assert.match(crossTab, /status:\s*410/);
  assert.doesNotMatch(chatbot, /from\(["']household_profiles["']\)/);
});

test("profiling aggregate export is aggregate-only and audit-fail-closed", async () => {
  const route = await source("src/app/api/profiling/analytics/[cycleId]/export/route.ts");
  assert.match(route, /phase1_profiling_aggregate/);
  assert.match(route, /enforceAggregateComplementarySuppression/);
  assert.match(route, /if \(!audited\)/);
  assert.doesNotMatch(route, /profiling_residents|profiling_resident_versions|first_name|birth_date|contact_number/);
});

test("survey, donation, and impact mutations use strict contracts and preserve history", async () => {
  const survey = await source("src/app/api/surveys/route.ts");
  const response = await source("src/app/api/surveys/[id]/respond/route.ts");
  const donation = await source("src/app/api/donations/route.ts");
  const distribution = await source("src/app/api/donations/[id]/distribute/route.ts");
  const impact = await source("src/app/api/impact/route.ts");
  for (const route of [survey, donation, distribution, impact]) assert.doesNotMatch(route, /\.\.\.body/);
  assert.match(survey, /phase1_save_survey/);
  assert.match(response, /phase1_submit_survey_response/);
  assert.match(distribution, /phase1_record_donation_distribution/);
  assert.match(donation, /phase1_save_donation/);
  assert.match(impact, /phase1_create_impact_record/);
});

test("profiling migrations are additive, deny direct PII access, and never fabricate residents", async () => {
  const foundation = await source("supabase/migrations/20260817000200_phase1_profiling_foundation.sql");
  const operations = await source("supabase/migrations/20260817000280_phase1_profiling_operations.sql");
  const imports = await source("supabase/migrations/20260817000260_phase1_profiling_queries_and_imports.sql");
  const executeHardening = await source("supabase/migrations/20260817000310_phase1_function_execute_hardening.sql");
  assert.match(foundation, /legacy_unverified/);
  assert.match(foundation, /profiling_residents/);
  assert.match(foundation, /phase1_rpc_only/);
  assert.doesNotMatch(foundation, /INSERT INTO public\.profiling_residents[\s\S]*household_profiles/);
  assert.match(operations, /phase1_complementary_suppress/);
  assert.match(operations, /duplicate_resolved/);
  assert.match(operations, /phase1_record_sample_outcome/);
  assert.match(operations, /phase1_revise_returned_profiling_submission/);
  assert.match(operations, /prefix is immutable after profiling codes are issued/);
  assert.match(imports, /profiling_duplicate_candidates/);
  assert.match(imports, /IF existing_status IS NOT NULL/);
  assert.match(imports, /status='committed'/);
  assert.match(executeHardening, /REVOKE ALL ON FUNCTION public\.%I\(%s\) FROM PUBLIC, anon/);
});
