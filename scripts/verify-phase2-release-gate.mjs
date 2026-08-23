import { resolve } from "node:path";
import { PHASE1_EVIDENCE_NAMES, PHASE2_EVIDENCE_NAMES } from "./lib/evidence-artifact-specs.mjs";
import { parseReleaseGateArguments, releaseGateUsage, runReleaseGate } from "./lib/run-release-gate.mjs";

const root = resolve(import.meta.dirname, "..");
let options;
try { options = parseReleaseGateArguments(process.argv.slice(2)); }
catch (error) { console.error(error.message); console.error(releaseGateUsage("scripts/verify-phase2-release-gate.mjs")); process.exit(2); }
if (options.help) { console.log(releaseGateUsage("scripts/verify-phase2-release-gate.mjs")); process.exit(0); }
await runReleaseGate({
  root,
  phase: "Phase 2",
  evidencePaths: [
    ...PHASE1_EVIDENCE_NAMES.map((name) => `docs/release-evidence/${name}`),
    ...PHASE2_EVIDENCE_NAMES.map((name) => `docs/release-evidence/phase-2/${name}`),
  ],
  flags: [
    "AGAPE_PROFILING_V2_ENABLED", "AGAPE_PARTNER_REGISTRY_V2_ENABLED",
    "AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED", "AGAPE_PROPOSALS_V2_ENABLED",
    "AGAPE_PROGRAM_FINANCE_V2_ENABLED", "AGAPE_EXTERNAL_CONTACT_EMAIL_ENABLED",
  ],
  ...options,
});
