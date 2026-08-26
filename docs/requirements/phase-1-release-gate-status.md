# Phase 1 release-gate status

Status: **OPEN — profiling must remain disabled**

## Implemented locally

- Canonical deny-only capability checks are used by the remediated operational
  APIs, including legacy-household, partnership, program, attendance, Admin, and
  AI-context boundaries.
- Legacy household list access is capability-scoped, redacted, and audit-fail-
  closed. New proposal evidence selects completed aggregate snapshots only.
- API profiling validation uses the cycle collection date, derives minor status,
  applies strict field/category rules, and limits multipart import bytes before
  parsing.
- Forward migration `20260817000410_phase1_release_gate_remediation.sql` adds
  catalog verification, deny-only RLS enforcement, explicit function grants,
  runtime-gated PII reads, strict SQL payload validation, version serialization,
  sample/correction checks, consent re-grant, completion blocking, and redacted
  duplicate-decision retention.
- The profiling UI supports registered sample selection, refusal/unavailable
  outcomes, draft saving, prior-roster seeding, returned-package correction, full
  Secretary detail review, imports, aggregate export, and Captain endorsement.
- Unsafe legacy instructions in `TESTING.md` were replaced with the current role,
  migration, privacy, and evidence gates.
- The active wireframe set now visibly retires institutional partner mutations,
  public institutional signup, broad household CRUD/export, and routine Admin
  domain access. Canonical Mermaid ERD, DFD, and actor/use-case artifacts are in
  `docs/diagrams/`.
- The release-gate verifier is deliberately fail-closed: it requires a verified
  pre-Phase-0 baseline plus dated migration, JWT/RLS, privacy, synthetic-pilot,
  credential, Auth, account-mapping, and rollback evidence.

## External or environment-dependent blockers

- No verified live migration ledger or pre-Phase-0 schema-only dump is available
  in this workspace. Therefore a canonical baseline cannot be generated safely,
  and unordered legacy SQL has not been archived.
- No disposable Supabase/Docker environment or database CLI is available here,
  so migration replay and real PostgreSQL syntax/constraint testing have not run.
- Direct JWT/PostgREST, storage, malicious RPC, and concurrency suites require the
  disposable project and real role tokens.
- Browser E2E requires configured synthetic accounts and setup data.
- Credential rotation, Auth redirect configuration, privacy approval, official
  sitio/assignment/sample inputs, retention procedures, and legacy-account
  mapping require authorized external evidence.

These are release blockers, not waived tests. `scripts/verify-phase1-release-gate.mjs`
fails until the required evidence artifacts and canonical baseline are present.

Repository tooling now validates the sanitized authoritative-export contract,
inventories active migrations against a private ledger, compares schema-only
dumps without printing definitions, runs disposable local replay gates, and
strictly validates solo-developer self-attested evidence envelopes for staging
development readiness. These tools do not manufacture missing artifacts or
authorize production activation.

## Migration impact

The remediation is forward-only and additive. It creates restrictive policies,
indexes, triggers, wrappers, and an explicit RPC allowlist. It does not delete
normalized profiling history. The live ledger must determine whether earlier
Phase 1 files are immutable/applied and whether only `00410` may be deployed.

## Security/RLS impact

Any unmapped public domain table, RLS-disabled table, or missing deny-only policy
causes the remediation migration to abort. Profiling functions lose inherited
`PUBLIC`, `anon`, and authenticated execution; only the reviewed application RPC
surface is granted back. Runtime `off` blocks identifiable reads and writes while
non-PII setup remains available to the Researcher.

## Rollback

Set application profiling false and database runtime `off`. Preserve all
normalized/versioned data and immutable audit history. Correct migration defects
with a new forward migration; never restore Admin roaming, broad RLS, direct PII
access, legacy writes, or hard deletion.
