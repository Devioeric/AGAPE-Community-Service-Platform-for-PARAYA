# Executed evidence template

Template-Only: true
Evidence-Status: DRAFT
Evidence-Result: NOT EXECUTED
Environment: <disposable-clone|development|staging>
Executed-Date: YYYY-MM-DD
Operator: Full Name (Role)
Review-Mode: SOLO-DEVELOPER-SELF-REVIEW
Independent-Review-Performed: false
Approval-Scope: DEVELOPMENT-READINESS-ONLY
Release-Revision: <immutable-git-commit>
Evidence-Reference: <private-access-controlled-reference>
Artifact-SHA256: <64-hex-sha256>

## Objective

State the exact release control and environment tested.

## Procedure and cases

Record sanitized commands or stable test IDs. Do not include credentials, JWTs,
connection strings, personal data, uploaded documents, or database rows.

## Results

Record pass/fail counts, discrepancies, remediation references, and the private
location of raw logs or screenshots.

## Solo-developer self-review

The operator attests that the evidence applies to the stated release revision
and that no failed or skipped case is represented as passing. This does not
authorize production activation.
