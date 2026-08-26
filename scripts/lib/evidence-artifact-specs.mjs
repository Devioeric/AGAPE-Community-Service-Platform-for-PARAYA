const TEST_OPERATORS = ["Security Test Operator", "QA Operator", "Database Operator", "E2E Operator"];

function artifact(relativePath, suiteId, options = {}) {
  return {
    relativePath,
    suiteId,
    environments: options.environments ?? ["disposable-clone"],
    operatorRoles: options.operatorRoles ?? TEST_OPERATORS,
    maxAgeDays: options.maxAgeDays === undefined ? 30 : options.maxAgeDays,
    minPassedCases: options.minPassedCases ?? 1,
    requiredExact: options.requiredExact ?? {},
    requiredFields: options.requiredFields ?? [],
    baseline: options.baseline ?? false,
  };
}

export const PHASE1_EVIDENCE_NAMES = [
  "baseline-manifest.md", "credential-rotation.md", "auth-configuration.md",
  "migration-reconciliation.md", "clone-replay.md", "jwt-rls-matrix.md",
  "storage-policy-matrix.md", "rpc-concurrency.md", "profiling-e2e.md",
  "ai-payload-privacy.md", "synthetic-reconciliation.md", "privacy-approval.md",
  "legacy-account-mapping.md", "rollback-rehearsal.md", "phase1-release-authorization.md",
];

export const PHASE2_EVIDENCE_NAMES = [
  "canonical-replay.md", "catalog-security.md", "jwt-rls-storage.md",
  "rpc-abuse-concurrency.md", "partner-backfill-reconciliation.md",
  "legacy-account-cutover.md", "historical-source-inventory.md", "phase2-e2e.md",
  "document-risk-retention.md", "outbox-delivery.md", "ai-interception.md",
  "rollback-rehearsal.md", "component-authorizations.md", "phase2-release-authorization.md",
];

const phase1 = [
  artifact("docs/release-evidence/baseline-manifest.md", "agape.phase1.baseline-equivalence.v1", {
    operatorRoles: ["Database Operator"], baseline: true,
  }),
  artifact("docs/release-evidence/credential-rotation.md", "agape.phase1.credential-rotation.v1", {
    environments: ["staging"], operatorRoles: ["Supabase Owner"], maxAgeDays: null,
  }),
  artifact("docs/release-evidence/auth-configuration.md", "agape.phase1.auth-configuration.v1", {
    environments: ["staging"], operatorRoles: ["Auth Administrator"],
  }),
  artifact("docs/release-evidence/migration-reconciliation.md", "agape.phase1.migration-reconciliation.v1", {
    environments: ["staging"], operatorRoles: ["Database Operator"],
    requiredFields: ["Repository-Inventory-SHA256", "Current-Ledger-SHA256", "Intended-Ledger-SHA256", "Baseline-Cut-Branch"],
    requiredExact: { "Unresolved-Items": "0", "Security-Unresolved-Items": "0" },
  }),
  artifact("docs/release-evidence/clone-replay.md", "agape.phase1.clone-replay.v1"),
  artifact("docs/release-evidence/jwt-rls-matrix.md", "agape.phase1.jwt-rls.v1"),
  artifact("docs/release-evidence/storage-policy-matrix.md", "agape.phase1.storage-policy.v1"),
  artifact("docs/release-evidence/rpc-concurrency.md", "agape.phase1.rpc-concurrency.v1"),
  artifact("docs/release-evidence/profiling-e2e.md", "agape.phase1.profiling-e2e.v1"),
  artifact("docs/release-evidence/ai-payload-privacy.md", "agape.phase1.ai-privacy.v1"),
  artifact("docs/release-evidence/synthetic-reconciliation.md", "agape.phase1.synthetic-reconciliation.v1"),
  artifact("docs/release-evidence/privacy-approval.md", "agape.phase1.privacy-approval.v1", {
    environments: ["staging"], operatorRoles: ["Privacy Coordinator"], maxAgeDays: null,
  }),
  artifact("docs/release-evidence/legacy-account-mapping.md", "agape.phase1.legacy-account-mapping.v1", {
    environments: ["staging"], operatorRoles: ["PARAYA Migration Owner"],
  }),
  artifact("docs/release-evidence/rollback-rehearsal.md", "agape.phase1.rollback-rehearsal.v1", {
    operatorRoles: ["Release Operator"],
  }),
  artifact("docs/release-evidence/phase1-release-authorization.md", "agape.phase1.release-authorization.v1", {
    environments: ["staging"], operatorRoles: ["Release Coordinator"],
    requiredExact: {
      "AGAPE-Profiling-Flag": "false", "Profiling-Runtime-Mode": "off",
      "Profiling-Workers": "stopped-or-no-op", "Real-Resident-Data-Admitted": "false",
      "Production-Activation-Authorized": "false",
    },
  }),
];

const phase2 = [
  artifact("docs/release-evidence/phase-2/canonical-replay.md", "agape.phase2.canonical-replay.v1"),
  artifact("docs/release-evidence/phase-2/catalog-security.md", "agape.phase2.catalog-security.v1"),
  artifact("docs/release-evidence/phase-2/jwt-rls-storage.md", "agape.phase2.jwt-rls-storage.v1"),
  artifact("docs/release-evidence/phase-2/rpc-abuse-concurrency.md", "agape.phase2.rpc-abuse-concurrency.v1"),
  artifact("docs/release-evidence/phase-2/partner-backfill-reconciliation.md", "agape.phase2.partner-backfill.v1"),
  artifact("docs/release-evidence/phase-2/legacy-account-cutover.md", "agape.phase2.legacy-cutover.v1", {
    environments: ["staging"], operatorRoles: ["PARAYA Migration Owner"],
  }),
  artifact("docs/release-evidence/phase-2/historical-source-inventory.md", "agape.phase2.historical-source-inventory.v1", {
    environments: ["staging"], operatorRoles: ["PARAYA Researcher", "PARAYA Associate"],
  }),
  artifact("docs/release-evidence/phase-2/phase2-e2e.md", "agape.phase2.e2e.v1"),
  artifact("docs/release-evidence/phase-2/document-risk-retention.md", "agape.phase2.document-risk-retention.v1", {
    environments: ["staging"], operatorRoles: ["Security Owner", "Privacy Coordinator"], maxAgeDays: null,
    requiredExact: { "Live-Document-Access": "disabled", "Risk-Decision": "approved" },
  }),
  artifact("docs/release-evidence/phase-2/outbox-delivery.md", "agape.phase2.outbox-delivery.v1"),
  artifact("docs/release-evidence/phase-2/ai-interception.md", "agape.phase2.ai-interception.v1"),
  artifact("docs/release-evidence/phase-2/rollback-rehearsal.md", "agape.phase2.rollback-rehearsal.v1", {
    operatorRoles: ["Release Operator"],
  }),
  artifact("docs/release-evidence/phase-2/component-authorizations.md", "agape.phase2.component-authorizations.v1", {
    environments: ["staging"], operatorRoles: ["Phase 2 Test Owner"],
    requiredExact: {
      "Partner-Registry-Final-Mode": "off", "Historical-Programs-Final-Mode": "off",
      "Structured-Proposals-Final-Mode": "off", "Program-Finance-Final-Mode": "off",
      "External-Contact-Email-Final-Mode": "off",
    },
  }),
  artifact("docs/release-evidence/phase-2/phase2-release-authorization.md", "agape.phase2.release-authorization.v1", {
    environments: ["staging"], operatorRoles: ["Release Coordinator"],
    requiredExact: {
      "AGAPE-Profiling-Flag": "false", "AGAPE-Partner-Registry-Flag": "false",
      "AGAPE-Historical-Programs-Flag": "false", "AGAPE-Proposals-Flag": "false",
      "AGAPE-Program-Finance-Flag": "false", "AGAPE-External-Contact-Email-Flag": "false",
      "AGAPE-Legacy-Account-Suspension-Flag": "false",
      "Profiling-Runtime-Mode": "off", "Partner-Registry-Mode": "off",
      "Historical-Programs-Mode": "off", "Structured-Proposals-Mode": "off",
      "Program-Finance-Mode": "off", "External-Contact-Email-Mode": "off",
      "Partner-Mutation-Authority": "v1", "Proposal-Mutation-Authority": "v1",
      "Gated-Workers": "stopped-or-no-op", "Suppressed-Messages-Released": "false",
      "Production-Activation-Authorized": "false",
    },
  }),
];

export const EVIDENCE_ARTIFACT_SPECS = new Map([...phase1, ...phase2].map((spec) => [spec.relativePath, spec]));

export function getEvidenceArtifactSpec(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const spec = EVIDENCE_ARTIFACT_SPECS.get(normalized);
  if (!spec) throw new Error(`No evidence artifact specification is registered for ${normalized}.`);
  return spec;
}
