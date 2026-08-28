import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = relative => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("Phase 6 reports are versioned, retained, and generated from a strict aggregate", async () => {
  const migration = await source("supabase/migrations/20260818001050_phase6_reporting_impact_communication.sql");
  const narrative = await source("src/app/api/ai/narrative-report/route.ts");
  const transition = await source("src/app/api/ai/reports/[id]/route.ts");
  assert.match(migration, /CREATE TABLE public\.report_lifecycle_events/);
  assert.match(migration, /approved_snapshot/);
  assert.match(migration, /approved_hash/);
  assert.match(migration, /phase6_reporting_aggregate/);
  assert.match(narrative, /reportingAggregateSchema\.parse/);
  assert.doesNotMatch(narrative, /\.from\("profiling_|\.from\("household|\.from\("resident/);
  assert.match(transition, /p_expected_version/);
  assert.match(transition, /phase6_transition_report/);
  assert.doesNotMatch(transition, /\.delete\(/);
});

test("Phase 6 delivery stays off by default and uses a leased audited outbox", async () => {
  const migration = await source("supabase/migrations/20260818001050_phase6_reporting_impact_communication.sql");
  const environment = await source(".env.example");
  const worker = await source("src/app/api/cron/notification-delivery/route.ts");
  assert.match(environment, /AGAPE_NOTIFICATION_DELIVERY_V1_ENABLED=false/);
  assert.match(migration, /mode text NOT NULL DEFAULT 'off'/);
  assert.match(migration, /notification_delivery_events_immutable/);
  assert.match(migration, /FOR UPDATE OF o SKIP LOCKED/);
  assert.match(migration, /phase6_requeue_suppressed_deliveries/);
  assert.match(worker, /isNotificationDeliveryEnabled/);
  assert.match(worker, /phase6_claim_notification_deliveries/);
  assert.match(worker, /phase6_finalize_notification_delivery/);
  assert.doesNotMatch(worker, /console\.(log|warn|error)/);
});

test("Phase 7 dashboards and readiness are role-scoped aggregate-only interfaces", async () => {
  const migration = await source("supabase/migrations/20260818001060_phase7_dashboard_readiness.sql");
  const dashboard = await source("src/app/api/dashboard/summary/route.ts");
  const readiness = await source("src/app/api/admin/readiness/route.ts");
  assert.match(migration, /phase7_get_dashboard_summary/);
  assert.match(migration, /historical account only/);
  assert.match(migration, /barangay scope missing/);
  assert.match(migration, /phase7_get_system_readiness/);
  assert.doesNotMatch(migration, /first_name|birth_date|storage_path|receipt|contact_number/);
  assert.match(dashboard, /dashboardSummarySchema/);
  assert.match(readiness, /authorizeCapability\("admin\.audit\.read"\)/);
  assert.match(readiness, /process\.env\[key\] === "true"/);
  assert.doesNotMatch(readiness, /API_KEY|SECRET|ENDPOINT/);
});
