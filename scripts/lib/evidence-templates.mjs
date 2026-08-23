import { basename } from "node:path";

const BASELINE_FIELDS = [
  ["Baseline-File", "20260815000000_pre_phase0_baseline.sql"],
  ["Baseline-SHA256", "<64-lowercase-hex>"],
  ["Authoritative-Dump-SHA256", "<64-lowercase-hex>"],
  ["Replay-1-Dump-SHA256", "<64-lowercase-hex>"],
  ["Replay-2-Dump-SHA256", "<64-lowercase-hex>"],
  ["Replay-Hashes-Match", "true"],
  ["Migration-Ledger-SHA256", "<64-lowercase-hex>"],
  ["Catalog-Count-Digest", "<64-lowercase-hex>"],
  ["Unexplained-Differences", "0"],
  ["Object-Count", "<positive-integer>"],
  ["PostgreSQL-Version", "15.x"],
  ["Supabase-CLI-Version", "2.114.0"],
];

export function templateRelativePathForSpec(spec) {
  const name = basename(spec.relativePath, ".md");
  const prefix = spec.relativePath.includes("/phase-2/") && !name.startsWith("phase2-") ? "phase2-" : "";
  return `docs/release-evidence/templates/${prefix}${name}.template.md`;
}

export function renderEvidenceTemplate(spec) {
  const title = basename(spec.relativePath, ".md").split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const environment = spec.environments.join("|");
  const operatorRoles = spec.operatorRoles.join("|");
  const reviewerRoles = spec.reviewerRoles.join("|");
  const rows = [
    ["Template-Only", "true"],
    ["Evidence-Status", "DRAFT"],
    ["Evidence-Result", "NOT EXECUTED"],
    ["Environment", `<${environment}>`],
    ["Executed-Date", "YYYY-MM-DD"],
    ["Operator", `Full Name (<${operatorRoles}>)`],
    ["Reviewer", `Different Full Name (<${reviewerRoles}>)`],
    ["Release-Revision", "<40-character-release-commit-R>"],
    ["Evidence-Reference", "<private-opaque-reference>"],
    ["Artifact-SHA256", "<64-lowercase-hex>"],
    ["Suite-ID", spec.suiteId],
    ["Suite-Version", "1.0.0"],
    ["Passed-Cases", `<integer-at-least-${spec.minPassedCases}>`],
    ["Failed-Cases", "0"],
    ["Skipped-Cases", "0"],
    ...spec.requiredFields.map((field) => [field, `<required-${field.toLowerCase()}>`]),
    ...Object.entries(spec.requiredExact),
    ...(spec.baseline ? BASELINE_FIELDS : []),
  ];
  return `# ${title} evidence template\n\n${rows.map(([key, value]) => `${key}: ${value}`).join("\n")}\n\n## Objective\n\nState the exact control, environment, release candidate, and private bundle tested.\n\n## Procedure and cases\n\nRecord sanitized command identifiers and case counts. Do not include credentials,\nJWTs, connection strings, personal data, uploaded documents, or database rows.\n\n## Results and independent review\n\nRecord discrepancies, remediation references, and the opaque private bundle\nreference. The reviewer confirms the evidence applies to release commit R and that\nzero failed or skipped mandatory cases are represented as passing.\n`;
}
