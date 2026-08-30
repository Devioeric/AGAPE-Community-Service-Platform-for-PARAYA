import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260818001070_community_needs_application_contract.sql", "utf8");
const route = readFileSync("src/app/api/community-needs/route.ts", "utf8");
const form = readFileSync("src/app/(dashboard)/barangay/submit-needs/page.tsx", "utf8");
const analyticsRoute = readFileSync("src/app/api/analytics/route.ts", "utf8");
const analyticsPage = readFileSync("src/app/(dashboard)/officer/analytics/community-needs/page.tsx", "utf8");

test("community-needs application contract is forward-only and keeps legacy fields synchronized", () => {
  assert.match(migration, /^--[\s\S]*\bBEGIN;/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS title text/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.sync_community_need_application_contract/);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.community_needs/);
  assert.match(migration, /NEW\.need_description :=/);
  assert.match(migration, /NEW\.priority_score :=/);
  assert.match(migration, /NEW\.identified_date :=/);
  assert.match(migration, /NEW\.status := CASE WHEN NEW\.resolved/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.sync_community_need_application_contract\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("community-needs API and form use the constrained canonical categories", () => {
  for (const category of ["health", "livelihood", "education", "infrastructure", "environment"]) {
    assert.match(form, new RegExp(`value: "${category}"`));
  }
  assert.match(route, /category: z\.string\(\)\.trim\(\)\.regex/);
  assert.doesNotMatch(form, /value: "(?:economic|environmental|social)"/);
});

test("PARAYA analytics preserves the bounded need title and description", () => {
  assert.match(analyticsRoute, /title:\s+\(n\.title \?\? "Community need"\)/);
  assert.match(analyticsRoute, /description:\s+\(n\.description \?\? n\.title \?\? "—"\)/);
  assert.match(analyticsPage, /\{need\.title\}/);
  assert.match(analyticsPage, /truncate\(need\.description\)/);
});
