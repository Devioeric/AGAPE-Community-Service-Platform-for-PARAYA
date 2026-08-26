import { resolve } from "node:path";
import { PHASE1_RELEASE_GATE_CONFIG } from "./lib/release-gate-config.mjs";
import { parseReleaseGateArguments, releaseGateUsage, runReleaseGate } from "./lib/run-release-gate.mjs";

const root = resolve(import.meta.dirname, "..");
let options;
try { options = parseReleaseGateArguments(process.argv.slice(2)); }
catch (error) { console.error(error.message); console.error(releaseGateUsage("scripts/verify-phase1-release-gate.mjs")); process.exit(2); }
if (options.help) { console.log(releaseGateUsage("scripts/verify-phase1-release-gate.mjs")); process.exit(0); }
await runReleaseGate({
  root,
  ...PHASE1_RELEASE_GATE_CONFIG,
  ...options,
});
