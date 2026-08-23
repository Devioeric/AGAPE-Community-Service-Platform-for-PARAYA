import { resolve } from "node:path";
import { runReleaseGate } from "./lib/run-release-gate.mjs";

const root = resolve(import.meta.dirname, "..");
const phase1Evidence = [
  "credential-rotation.md", "auth-configuration.md", "migration-reconciliation.md",
  "clone-replay.md", "jwt-rls-matrix.md", "storage-policy-matrix.md",
  "rpc-concurrency.md", "profiling-e2e.md", "ai-payload-privacy.md",
  "synthetic-reconciliation.md", "privacy-approval.md", "legacy-account-mapping.md",
  "rollback-rehearsal.md", "phase1-release-authorization.md",
];
const phase2Evidence = [
  "canonical-replay.md", "catalog-security.md", "jwt-rls-storage.md", "rpc-abuse-concurrency.md",
  "partner-backfill-reconciliation.md", "legacy-account-cutover.md", "historical-source-inventory.md",
  "phase2-e2e.md", "document-risk-retention.md", "outbox-delivery.md", "ai-interception.md",
  "rollback-rehearsal.md", "component-authorizations.md", "phase2-release-authorization.md",
];
await runReleaseGate({
  root,
  phase: "Phase 2",
  evidenceDir: resolve(root, "docs/release-evidence/phase-2"),
  evidenceNames: phase2Evidence,
  inheritedEvidenceNames: phase1Evidence,
  flags: [
    "AGAPE_PROFILING_V2_ENABLED", "AGAPE_PARTNER_REGISTRY_V2_ENABLED",
    "AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED", "AGAPE_PROPOSALS_V2_ENABLED",
    "AGAPE_PROGRAM_FINANCE_V2_ENABLED", "AGAPE_EXTERNAL_CONTACT_EMAIL_ENABLED",
  ],
});
