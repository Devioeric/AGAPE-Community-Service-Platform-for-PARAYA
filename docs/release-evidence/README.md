# AGAPE release evidence

Status: **Open. No Phase 1 or Phase 2 release approval is recorded here.**

This directory is a non-secret index for evidence produced by an authorized
operator in a named environment. A checklist, template, source-code test, or
filename is not evidence that a control passed.

Never commit credentials, access tokens, JWTs, database passwords, service-role
keys, personal data, contact lists, resident data, uploaded documents, receipts,
or database dumps containing rows. Keep sensitive source artifacts in the
approved private evidence store and record only its access-controlled reference,
reviewer, date, sanitized result, and cryptographic digest when appropriate.

## Evidence states

- **Missing**: no executed artifact exists.
- **Draft**: evidence was captured but has not been independently reviewed.
- **Failed**: the executed check found a release blocker.
- **Passed, awaiting approval**: the check passed but is not approved.
- **Approved**: an authorized independent reviewer approved the evidence scope.
- **Expired**: the environment or configuration changed after approval.

Templates under [`templates/`](templates/) always remain **Not executed**. Do
not rename or copy one to a required evidence filename until the operation has
actually been performed and independently reviewed.

## Phase 1 required artifacts

The fail-closed checker requires an approved baseline manifest plus these
executed files directly in this directory:

- `baseline-manifest.md`

- `credential-rotation.md`
- `auth-configuration.md`
- `migration-reconciliation.md`
- `clone-replay.md`
- `jwt-rls-matrix.md`
- `storage-policy-matrix.md`
- `rpc-concurrency.md`
- `profiling-e2e.md`
- `ai-payload-privacy.md`
- `synthetic-reconciliation.md`
- `privacy-approval.md`
- `legacy-account-mapping.md`
- `rollback-rehearsal.md`
- `phase1-release-authorization.md`

Each artifact must include the exact machine-readable fields documented by the
[operator runbook](operator-runbook.md), including `Evidence-Status: APPROVED`,
`Evidence-Result: PASS`, a real environment, execution date, named reviewer,
release revision, and non-placeholder private evidence reference. The baseline
manifest must contain the reviewed SHA-256 of the canonical baseline and match
the file byte-for-byte. Every artifact also records `Artifact-SHA256`, binding
the committed review envelope to the private evidence bundle that was reviewed.

Running `npm.cmd run test:release-gate` is necessary but not sufficient. It
validates the evidence envelope and baseline digest, not the truth of private
screenshots, test logs, or approvals. The release owner must still inspect them.

Use the [release-gate matrix](release-gate-matrix.md) for dependencies and the
[operator runbook](operator-runbook.md) for safe evidence capture. Phase 2 is
indexed separately in [`phase-2/README.md`](phase-2/README.md).

Phase 1 remains open until every artifact is approved, the canonical baseline is
verified, all executable suites pass, and a dated release authorization exists.
Phase 2 cannot leave `off` while Phase 1 is open.
