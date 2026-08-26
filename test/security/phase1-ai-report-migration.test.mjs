import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("AI report compatibility migration preserves legacy rows and adds the narrative lifecycle", async () => {
  const source = await readFile(new URL("../../supabase/migrations/20260818000840_phase1_ai_report_compatibility.sql", import.meta.url), "utf8");
  assert.match(source, /ADD COLUMN IF NOT EXISTS narrative text/);
  assert.match(source, /narrative=coalesce\(narrative,content\)/);
  assert.match(source, /created_at=coalesce\(created_at,generated_at\)/);
  assert.match(source, /ALTER COLUMN report_type DROP NOT NULL/);
  assert.match(source, /CHECK\(status IN\('draft','reviewed','approved'\)\)/);
  assert.match(source, /CHECK\(period_end>=period_start\)/);
  assert.doesNotMatch(source, /DROP TABLE|DELETE FROM public\.ai_reports|TRUNCATE/i);
});

test("legacy development reports seed both compatibility and canonical fields", async () => {
  const seed = await readFile(new URL("../../supabase/seed.sql", import.meta.url), "utf8");
  assert.match(seed, /INSERT INTO public\.ai_reports \([\s\S]*title, period_start, period_end, narrative, status, reviewed_by/);
  assert.match(seed, /period_start::date,[\s\S]*period_end::date/);
});
