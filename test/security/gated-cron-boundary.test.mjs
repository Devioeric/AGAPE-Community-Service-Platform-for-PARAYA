import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gatedWorkers = [
  "src/app/api/cron/profiling-import-purge/route.ts",
  "src/app/api/cron/profiling-reminder/route.ts",
  "src/app/api/cron/phase2-renewal-reminders/route.ts",
  "src/app/api/cron/phase2-historical-import-purge/route.ts",
  "src/app/api/cron/phase2-contact-outbox/route.ts",
];

test("gated workers authenticate before disclosing disabled state", async () => {
  for (const path of gatedWorkers) {
    const source = await readFile(path, "utf8");
    const authIndex = Math.max(
      source.indexOf("requireCronAuth(request)"),
      source.indexOf("request.headers.get(\"authorization\")"),
    );
    const gateIndexes = [
      source.indexOf("isProfilingV2Enabled()"),
      source.indexOf("isPhase2ComponentEnabled("),
    ].filter((value) => value >= 0);
    assert.ok(authIndex >= 0, `${path} must authenticate cron requests`);
    assert.ok(gateIndexes.length > 0, `${path} must have a component gate`);
    assert.ok(authIndex < Math.min(...gateIndexes), `${path} must authenticate before its component gate`);
  }
});
