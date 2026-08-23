# Privacy Approval evidence template

Template-Only: true
Evidence-Status: DRAFT
Evidence-Result: NOT EXECUTED
Environment: <production>
Executed-Date: YYYY-MM-DD
Operator: Full Name (<Privacy Coordinator>)
Reviewer: Different Full Name (<DPO|Privacy Reviewer>)
Release-Revision: <40-character-release-commit-R>
Evidence-Reference: <private-opaque-reference>
Artifact-SHA256: <64-lowercase-hex>
Suite-ID: agape.phase1.privacy-approval.v1
Suite-Version: 1.0.0
Passed-Cases: <integer-at-least-1>
Failed-Cases: 0
Skipped-Cases: 0

## Objective

State the exact control, environment, release candidate, and private bundle tested.

## Procedure and cases

Record sanitized command identifiers and case counts. Do not include credentials,
JWTs, connection strings, personal data, uploaded documents, or database rows.

## Results and independent review

Record discrepancies, remediation references, and the opaque private bundle
reference. The reviewer confirms the evidence applies to release commit R and that
zero failed or skipped mandatory cases are represented as passing.
