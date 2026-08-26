# AGAPE release-gate matrix

This matrix reconciles Phase 1 and Phase 2 evidence dependencies. It records the
repository's fail-closed state; it does not approve a deployment.

## Phase 1 gate

All rows are **Missing or not self-reviewed** unless a separate,
executed artifact with the exact required filename exists.

| Artifact | Control owner | Review mode | Minimum proof |
|---|---|---|---|
| Canonical baseline and `baseline-manifest.md` | Database operator | Solo-developer self-review | Live ledger and schema-only reconciliation, reviewed diff, matching SHA-256, clean rebuild |
| `credential-rotation.md` | Supabase project owner | Solo-developer self-review | Exposed credential revoked, old credential rejected, replacement only in approved secret stores |
| `auth-configuration.md` | Auth administrator | Solo-developer self-review | Exact origins and redirects; callback, invite, and recovery tests |
| `migration-reconciliation.md` | Database operator | Solo-developer self-review | Live ledger, repository inventory, drift decisions, forward-only deployment set |
| `clone-replay.md` | Database operator | Solo-developer self-review | Clean baseline-to-Phase-1 replay, schema diff, fixture decision |
| `jwt-rls-matrix.md` | Security tester | Solo-developer self-review | Direct PostgREST/JWT matrix for every role, status, deny override, barangay, and sitio |
| `storage-policy-matrix.md` | Storage administrator | Solo-developer self-review | Private buckets, object RLS, parent binding, signed URLs, quarantine, denial cases |
| `rpc-concurrency.md` | Database tester | Solo-developer self-review | Malicious direct RPC, audit failure, stale version, race and idempotency results |
| `profiling-e2e.md` | QA operator | Solo-developer self-review | Full synthetic setup, collection, return, approval, import, lifecycle, completion, endorsement |
| `ai-payload-privacy.md` | AI/privacy tester | Solo-developer self-review | Intercepted payload inventory proving no identifiers or raw profiles leave the boundary |
| `synthetic-reconciliation.md` | Research/QA operator | Solo-developer self-review | Official-versus-sample counts, exclusions, suppression, immutable evidence |
| `privacy-approval.md` | Data controller/DPO | Solo-developer self-review | Approved notice, purpose, consent, access, retention, rights, incident, processor controls |
| `legacy-account-mapping.md` | PARAYA migration owner | Solo-developer self-review | Mapping, pending-work reassignment, read-only proof, sign-off, account-preservation plan |
| `rollback-rehearsal.md` | Release operator | Solo-developer self-review | Flags/modes off, stopped jobs, retained history, compatibility smoke, forward correction |

## Phase 2 inheritance

Phase 2 inherits every Phase 1 gate. A Phase 2 component test never waives a
missing Phase 1 artifact. Each component also requires approved evidence before
its server flag and database runtime can change from `off`.

| Component | Additional component evidence |
|---|---|
| Partner registry | Backfill counts, no auto-merge, contact/term/document authorization, metrics, renewal rules |
| Historical programs | Official implementation date, five-year inventory, quality workflow, import/duplicate/idempotency/purge, analytics separation |
| Structured proposals | Atomic graph create/edit, V1/V2 shadow reconciliation, human workflow, provenance, exact budget revisions |
| Program finance | Handoff idempotency, allocations/actuals, parent-bound receipts, correction/void, variance/balance, liquidation reconciliation |
| External contact email | Opt-in, effective contact dates, templates, provider configuration, retry/lease/dead-letter, no sensitive logging |

Shared Phase 2 evidence includes baseline-to-Phase-2 clone replay, capability
parity, direct JWT/RLS/Storage tests, RPC abuse/concurrency, browser E2E,
background-job idempotency, analytics separation, AI interception, and rollback.

## Dependency order

1. Revoke exposed credentials and verify Auth configuration.
2. Reconcile the live ledger and create the reviewed canonical baseline without
   production rows.
3. Replay Phase 0 and Phase 1 on a disposable clone and complete executable
   security, privacy, profiling, and rollback evidence.
4. Obtain privacy and legacy-account approvals and close Phase 1.
5. Replay Phase 2 only on a disposable clone and execute shared evidence.
6. Approve components separately: Partner registry, historical programs,
   structured proposals, program finance, then external contact email.
7. Enable one component in `synthetic`, reconcile it, and return it to `off` on
   any finding. Live mode requires separate dated authorization.

AI recommendations, unmet-need automation, volunteer proximity, and blockchain
are not release shortcuts. Blockchain Question 329 remains **Needs confirmation**
and no personal data may be placed on a blockchain.
