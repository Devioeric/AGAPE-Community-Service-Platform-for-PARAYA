import { resolve } from "node:path";
import { PHASE1_EVIDENCE_NAMES } from "./lib/evidence-artifact-specs.mjs";
import { parseReleaseGateArguments, releaseGateUsage, runReleaseGate } from "./lib/run-release-gate.mjs";

const root = resolve(import.meta.dirname, "..");
let options;
try { options = parseReleaseGateArguments(process.argv.slice(2)); }
catch (error) { console.error(error.message); console.error(releaseGateUsage("scripts/verify-phase1-release-gate.mjs")); process.exit(2); }
if (options.help) { console.log(releaseGateUsage("scripts/verify-phase1-release-gate.mjs")); process.exit(0); }
await runReleaseGate({
  root,
  phase: "Phase 1",
  evidencePaths: PHASE1_EVIDENCE_NAMES.map((name) => `docs/release-evidence/${name}`),
  flags: ["AGAPE_PROFILING_V2_ENABLED"],
  ...options,
});
