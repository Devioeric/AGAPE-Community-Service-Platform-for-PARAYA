# Baseline Manifest evidence template

Template-Only: true
Evidence-Status: DRAFT
Evidence-Result: NOT EXECUTED
Environment: <disposable-clone>
Executed-Date: YYYY-MM-DD
Operator: Full Name (<Database Operator>)
Review-Mode: SOLO-DEVELOPER-SELF-REVIEW
Independent-Review-Performed: false
Approval-Scope: DEVELOPMENT-READINESS-ONLY
Release-Revision: <40-character-release-commit-R>
Evidence-Reference: <private-opaque-reference>
Artifact-SHA256: <64-lowercase-hex>
Suite-ID: agape.phase1.baseline-equivalence.v1
Suite-Version: 1.0.0
Passed-Cases: <integer-at-least-1>
Failed-Cases: 0
Skipped-Cases: 0
Baseline-File: 20260815000000_pre_phase0_baseline.sql
Baseline-SHA256: <64-lowercase-hex>
Authoritative-Dump-SHA256: <64-lowercase-hex>
Replay-1-Dump-SHA256: <64-lowercase-hex>
Replay-2-Dump-SHA256: <64-lowercase-hex>
Replay-Hashes-Match: true
Migration-Ledger-SHA256: <64-lowercase-hex>
Catalog-Count-Digest: <64-lowercase-hex>
Unexplained-Differences: 0
Object-Count: <positive-integer>
PostgreSQL-Version: 15.x
Supabase-CLI-Version: 2.114.0

## Objective

State the exact control, environment, release candidate, and private bundle tested.

## Procedure and cases

Record sanitized command identifiers and case counts. Do not include credentials,
JWTs, connection strings, personal data, uploaded documents, or database rows.

## Results and solo-developer self-review

Record discrepancies, remediation references, and the opaque private bundle
reference. The operator attests that the evidence applies to release commit R and
that zero failed or skipped mandatory cases are represented as passing. This
self-review closes development readiness only and never authorizes production.
