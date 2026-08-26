import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("sample-register API explicitly adapts the database RPC to the stable UI DTO", async () => {
  const source = await readFile(new URL("../../src/app/api/profiling/sample-register/route.ts", import.meta.url), "utf8");
  assert.match(source, /sample_reference: row\.sampleReference/);
  assert.match(source, /contact_outcome: row\.contactOutcome/);
  assert.match(source, /row_version: row\.rowVersion/);
  assert.doesNotMatch(source, /NextResponse\.json\(\{ data \}\)/);
  assert.doesNotMatch(source, /select\(["']\*["']\)/);
});
