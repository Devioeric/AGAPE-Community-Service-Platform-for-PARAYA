# AGAPE Verification and Release Guide

This guide is authoritative for the current repository and replaces the legacy
role and paste-every-SQL instructions.

## Release state

Phase 1 is release-gated. Keep `AGAPE_PROFILING_V2_ENABLED=false` and the database
`profiling_runtime_settings.mode` set to `off`. Local tests, typecheck, lint, and
a production build do not prove migrations, RLS, RPC concurrency, or deployed
Auth configuration.

## Supported login actors

- System Admin: infrastructure, accounts, audit, and recovery only.
- Director: operational management, final proposal decisions, aggregate
  profiling, and privacy configuration.
- Associate: operational management and aggregate profiling.
- Researcher: profiling setup, collection support, identity resolution,
  lifecycle corrections, and authorized detail.
- Finance: finance clearance or return only.
- Captain: approved own-barangay detail, aggregates, community-need validation,
  and optional cycle endorsement.
- Secretary: own-barangay detail and approval/return.
- Mother Leader: pending packages for currently assigned sitios only.
- Volunteer: volunteer self-service only.

`office`, `student_org`, and `department` are temporary historical-read-only
identities. `paraya_officer` and `barangay_official` must be mapped to an approved
role or suspended before live profiling.

## Safe migration procedure

Do not paste every file in `supabase/migrations` into a live SQL editor. The
repository still requires a verified pre-Phase-0 baseline produced from the
actual project ledger and schema dump.

1. Rotate any credential previously exposed in local command configuration.
2. Export the live ledger, schema-only dump, extensions, policies, grants,
   triggers, functions, storage buckets, and storage policies.
3. Reconcile them using
   `docs/requirements/phase-0-supabase-schema-reconciliation.md`.
4. Build and review the timestamped pre-Phase-0 baseline from that evidence.
   Never synthesize it from `supabase/seed.sql`.
5. Archive unordered legacy SQL only after that baseline reproduces the verified
   schema on a disposable Supabase instance.
6. Replay the canonical chain twice with normal seeding disabled and compare the
   resulting schema hashes.
7. Apply only the reviewed synthetic release fixture in a separate disposable
   replay. Run `supabase/seed.sql` separately as a legacy-development
   compatibility check; it is never release data or baseline input.
8. Run direct JWT/RLS, RPC, concurrency, storage, and browser suites.

If a migration is already in the live ledger, do not edit it. Correct it with a
new idempotent forward migration.

## Local checks

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run db:validate-evidence -- --capture-dir <private-authoritative-capture>
npm.cmd run db:inventory -- --check --ledger <private-ledger-version-file>
npm.cmd run db:schema-equivalence -- --authoritative <private-schema-only.sql> --replay <private-replay-schema.sql>
npm.cmd run db:catalog-equivalence -- --authoritative-capture <private-authoritative-capture> --replay-capture <private-replay-capture>
npm.cmd run test:db:preflight
```

The Node suite includes pure-contract and source guards. It does not execute
PostgreSQL and cannot satisfy the database release gate by itself.

The inventory and preflight commands are intentionally expected to fail while
the canonical baseline is missing, unordered SQL remains active, or Docker is
unavailable. Never create placeholder baseline/evidence files to make them pass.
The authoritative-evidence validator reports hashes, sizes, counts, and
problems only; it never prints or copies SQL/catalog content.

After preflight passes, authorize only the disposable project identifier and
run the complete local gate:

```powershell
$env:AGAPE_DB_TEST_CONFIRM_DISPOSABLE = "agape-release-gate"
npm.cmd run test:db:phase1
npm.cmd run test:db:phase2
# or run both sequentially:
npm.cmd run test:db:gates
```

The harness creates an untracked temporary Supabase project, strips remote
credentials through an explicit environment allowlist, forces all application
flags false, creates a different temporary project for each clean replay,
compares schema hashes, executes pgTAP, validates the reviewed `.invalid`
synthetic fixture, and finally checks the legacy development seed in another
fresh replay. It stops and removes only the project whose ID is exactly
`agape-release-gate`. The reviewed migration, fixture, and assertion membership
for each scope is defined in `supabase/database-gate-scopes.json`; Phase 1 is
never inferred from a numeric timestamp cutoff.

The runner does not write approved Markdown evidence. To retain a sanitized
machine result, pass an encrypted artifact directory outside this repository:

```powershell
npm.cmd run test:db:phase1 -- --artifact-dir <private-outside-git-directory>
```

The JSON result contains suite/revision/scope identifiers, the migration-list
and schema/catalog digests, case counts, timestamps, and final disabled/V1
assertions. It never contains local keys or connection strings and still
requires human review before an evidence envelope may be approved.

Before the baseline is promoted or legacy SQL is archived, an authorized private
candidate can be replayed without copying unordered migrations into the temporary
project:

```powershell
node scripts/run-local-database-gates.mjs --replay-only --scope reconciliation-applied --baseline-candidate <private-baseline.sql> --capture-dir <private-authoritative-capture>
node scripts/run-local-database-gates.mjs --replay-only --scope reconciliation-full --baseline-candidate <private-baseline.sql> --capture-dir <private-authoritative-capture>
```

This candidate mode never promotes the baseline or edits the repository. A
passing replay still requires schema/catalog equivalence and independent review.

## Direct database acceptance matrix

For every role, repeat tests with an active account, an inactive account, and a
role-allowed account whose relevant permission module is `false`.

- Admin cannot access operational tables, resident profiles, survey answers,
  donor/recipient identities, volunteer rosters, or operational AI context.
- Director/Associate cannot read resident detail. Finance/Volunteer cannot use
  profiling. Legacy institutional roles see historical summaries only.
- Mother Leaders cannot access another barangay, unassigned/expired sitios,
  another collector's package, or approved detail.
- Secretary/Captain cannot cross their barangay boundary.
- A false permission override denies API and PostgREST access and never grants a
  capability absent from the role.
- `anon`, `PUBLIC`, pending, suspended, and inactive identities cannot execute
  profiling functions or access protected tables/storage.
- Every public domain table has RLS, a table-to-module mapping, active-account
  isolation, Admin/legacy isolation, and the deny-only restrictive policy.
- No profiling function is executable by `PUBLIC` or `anon`; authenticated RPCs
  exactly match the reviewed application allowlist.

## Profiling synthetic E2E

Use synthetic users and a clearly demo-only barangay. Enable `synthetic` runtime
only after setup is complete.

1. Researcher configures prefix, sitios, effective assignments, privacy notice,
   suppression threshold (minimum 5), verified official snapshot, cycle, and
   opaque sample register.
2. Mother Leader sees assigned samples and records refusal/unavailability without
   creating resident records.
3. Save a draft, record household plus adult/guardian consent, and submit.
4. Secretary reviews resident and consent detail, returns with a reason, and
   approves only after corrected resubmission.
5. Reprofile in a later cycle. Household/Resident UUIDs and codes remain stable;
   version numbers increase.
6. Exercise new-member, transfer, inactive/move-out, death, household move or
   dissolution, merge, consent withdrawal, and re-consent with expected versions,
   effective dates, and reasons.
7. Preview XLSX and paired CSV, replace a failed upload, resolve `linked`,
   `distinct`, and `exclude` duplicates, then prove commit idempotency.
8. Race duplicate decisions, versions, decisions, transfers, replacements, and
   import commit. Exactly one stale operation loses without partial writes.
9. Completion fails while samples, submissions, imports, or duplicates remain
   unresolved. Captain endorsement remains separate.
10. Reconcile official and sample totals; completed evidence stays immutable.

## Privacy acceptance

- API and direct RPC requests reject unknown keys, wrong JSON types, invalid
  categories, PII hidden in categories, government-ID synonyms, images,
  biometrics, coordinates, exact income, diagnoses, medical notes, and passwords.
- Minor status uses the cycle collection date. Minors require guardian
  authorization; adults require adult consent.
- No identifiable export exists. Aggregate exports contain schema version,
  cycle, sample, coverage, source, as-of date, privacy, and quality metadata.
- Counts one through four are suppressed. If a peer cannot protect a single small
  cell, the whole dimension is suppressed with no drill-through.
- Intercept every AI request. No resident name, contact, birth date, landmark,
  code/UUID, profile JSON, or resident-derived free text may leave the boundary.
- Legacy identifiable reads use a redacted allowlist and fail if their audit
  event cannot be durably recorded.

## Workflow regressions

- AI never submits, advances, approves, or rejects proposals.
- Director alone performs final proposal approval/rejection. Finance alone clears
  or returns budget and cannot decide the project.
- Validation failures warn/block; they do not auto-reject. Transitions use
  expected-state atomic writes and immutable history.
- New proposal evidence uses completed aggregate snapshots. Historical household
  links never display household-head names.
- Surveys save drafts and publish separately; response/question binding is
  atomic and correction history is append-only.
- Donation distribution locks inventory and uses archive/void corrections.
- Impact uses correction/void history. Archived/voided rows are excluded from
  analytics, reports, snapshots, and AI.
- Retired backup, validation, deletion, and partner-roster actions remain absent.

## Required release evidence

Store non-secret artifacts under `docs/release-evidence/`:

- credential-rotation confirmation (never the credential);
- Auth redirect/recovery configuration;
- migration ledger/schema reconciliation and clean clone replay log;
- JWT/PostgREST/storage matrix and malicious-RPC/concurrency results;
- Playwright report and AI-payload interception report;
- synthetic count reconciliation and rollback rehearsal;
- privacy approval, controller/DPO contact, notice, retention, correction,
  refusal, incident, and deletion procedures;
- official sitios, assignments, sampling plan, and official source/as-of date;
- legacy-account mapping/suspension report.

Phase 1 closes only when all evidence exists and all automated checks pass.
Phase 2 must not be deployed before that decision. Dark Phase 2 development is
allowed only with every server flag false and every database component mode
`off`; V1 remains authoritative.

## Phase 2 dark-development and release gate

The active forward-only Phase 2 chain is:

1. `20260818000100_phase2_partner_history_foundation.sql`
2. `20260818000200_phase2_proposal_finance_foundation.sql`
3. `20260818000300_phase2_security_and_core_rpcs.sql`
4. `20260818000400_phase2_proposal_workflow_and_handoff.sql`
5. `20260818000500_phase2_program_finance_rpcs.sql`
6. `20260818000600_phase2_renewal_outbox.sql`
7. `20260818000700_phase2_completion_remediation.sql`
8. `20260818000710_phase2_partner_history_operations.sql`
9. `20260818000720_phase2_proposal_budget_operations.sql`
10. `20260818000730_phase2_program_finance_operations.sql`
11. `20260818000740_phase2_historical_imports.sql`
12. `20260818000750_phase2_document_boundary.sql`

Do not apply these files to a shared database. Replay them only after the
canonical baseline and complete Phase 0/1 chain pass in a disposable clone.
Verify that a missing prerequisite aborts the first migration without a partial
commit.

Required Phase 2 acceptance suites:

- TypeScript/SQL capability parity, including false module overrides.
- Direct JWT attempts by all target, inactive, Admin, and legacy roles.
- Runtime `off`, synthetic allowlist, and live-mode configuration boundaries.
- Direct mutation denial for Partner contacts/documents, versions/events,
  mappings, historical review, proposal workflow, and all finance tables.
- Partner backfill count equality, no automatic organization merging, and no
  rewrite of original proposal/program actor IDs.
- Historical five-year eligibility, quality labels, import limits, duplicates,
  idempotent commit, and separation from operational totals.
- Proposal graph races, Finance return-versus-clear, Director approve-versus-
  reject, and one-to-one idempotent program handoff.
- Exact decimal budget reconciliation, zero-cash rules, expenditure correction,
  receipt exceptions, liquidation review, and budget-versus-actual separation.
- Private Storage bucket policy, MIME/signature/size checks, quarantine, and
  signed-URL parent binding.
- Outbox and 60/30/7 renewal reminder idempotency. External mail remains
  suppressed while its flag is false.
- AI interception proving that no contact, agreement, historical narrative,
  budget description, receipt, document, or row-level Phase 2 data is sent.

The current Node tests are contract/source checks, not evidence that SQL replay,
RLS, Storage, concurrency, or browser workflows passed. Record those executable
results under `docs/release-evidence/phase-2/` before enabling any component.
