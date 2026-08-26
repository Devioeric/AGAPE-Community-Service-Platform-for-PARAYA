# Phase 2 release evidence

This directory intentionally contains no fabricated evidence. Before any Phase 2
component leaves `off`, add dated, non-secret artifacts for:

- canonical baseline and live migration-ledger reconciliation;
- clean baseline-to-Phase-2 clone replay and seed results;
- JWT/PostgREST/RLS and Storage-policy matrices;
- RPC abuse, audit-failure, and concurrency results;
- Partner/barangay, legacy mapping, proposal, handoff, and budget backfill counts;
- full Partner, historical intake, proposal, Finance, handoff, actuals, and
  liquidation browser E2E results;
- private document retention/access policy and malware scanning or risk approval;
- official AGAPE implementation date and five-year source inventory;
- legacy-account mapping, pending-work reassignment, sign-off, and proof that
  existing development accounts remain preserved;
- external contact opt-ins, Resend/template/outbox delivery tests;
- AI payload interception and operational/historical analytics separation;
- rollback rehearsal and approval to change each database mode.
- component-by-component authorization and final Phase 2 release authorization.

Never store credentials, access tokens, resident data, contact lists, documents,
receipts, or other personal data in this repository.

Executed files must use the evidence envelope in the parent
[`operator-runbook.md`](../operator-runbook.md). Templates are kept under
[`../templates/`](../templates/) and can never satisfy the release checker.

Final verification inherits every Phase 1 artifact and uses:

```powershell
npm.cmd run test:phase2-release-gate -- --release-revision <40-character-R> --artifact-index <private-index>
```

All Phase 1 files remain directly under `docs/release-evidence/`; there is no
`phase-1/` evidence directory.
