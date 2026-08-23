import { resolve } from "node:path";
import { runReleaseGate } from "./lib/run-release-gate.mjs";

const root = resolve(import.meta.dirname, "..");
const requiredEvidence = [
  "credential-rotation.md", "auth-configuration.md", "migration-reconciliation.md",
  "clone-replay.md", "jwt-rls-matrix.md", "storage-policy-matrix.md",
  "rpc-concurrency.md", "profiling-e2e.md", "ai-payload-privacy.md",
  "synthetic-reconciliation.md", "privacy-approval.md",
  "legacy-account-mapping.md", "rollback-rehearsal.md", "phase1-release-authorization.md",
];
await runReleaseGate({
  root,
  phase: "Phase 1",
  evidenceDir: resolve(root, "docs/release-evidence"),
  evidenceNames: requiredEvidence,
  flags: ["AGAPE_PROFILING_V2_ENABLED"],
});
