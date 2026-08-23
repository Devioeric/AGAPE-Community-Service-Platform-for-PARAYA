# Phase 1 Authorization Closure and Profiling Foundation

## Outcome

Phase 1 adds a deny-first authorization model and an additive, cycle-aware resident-profiling foundation. The implementation remains disabled by default through `AGAPE_PROFILING_V2_ENABLED`. It must not receive real resident data until the deployment gates below are satisfied.

The canonical requirements remain [the AGAPE scope baseline](../requirements/agape-scope-baseline.md). This document records implementation decisions; it does not convert any baseline **Needs confirmation** item into a final requirement.

## Delivered boundaries

- A typed role-to-capability matrix is shared by APIs and mirrored by fixed-search-path database functions. Per-user permissions are deny-only.
- System Admin is confined to infrastructure routes and has no routine operational or resident access.
- Office, Student Organization, and Department identities retain a temporary read-only historical portal. They cannot mutate domain data or access volunteer PII.
- Legacy household data is marked `legacy_unverified`, retained for proposal links, made read-only, and excluded from new analytics. No resident is generated from `member_count`.
- Profiling uses normalized sitios, temporal Mother Leader assignments, privacy notices/settings, cycles, official snapshots, sample outcomes, stable household/resident identities, effective memberships, immutable submission versions, consents, events, import staging, duplicate decisions, and aggregate evidence.
- PII tables deny ordinary direct PostgREST access. Narrow RPCs verify active account, capability, deny override, barangay/sitio scope, expected version, and workflow state.
- Analytics use approved packages only. Aggregate cells use a configurable threshold of at least five and complementary suppression. AI-facing legacy household queries are disabled.
- XLSX and paired CSV imports are server-parsed, capped at 10 MB and 10,000 combined rows, and reject prohibited fields. Raw file bytes are never persisted; sanitized staging is purged after commit or expiry.
- Survey responses are validated and committed atomically. Donation distributions use row locking and inventory checks. Donation and impact records use archive/void/correction workflows instead of hard deletion.
- `20260817000400_phase1_completion_gate.sql` is the forward-only closure layer: it adds database-side allowlisted profile validation, derived age/consent rules, runtime modes, registered sample units, stable cross-cycle identities, lifecycle/membership operations, v2 aggregate evidence, concurrency-safe duplicate linking, and final RLS guards.

## Migration order and impact

Apply only after Phase 0 has been reconciled against a disposable clone:

1. `20260817000100_phase1_authorization_closure.sql`
2. `20260817000200_phase1_profiling_foundation.sql`
3. `20260817000250_phase1_profiling_rpcs.sql`
4. `20260817000260_phase1_profiling_queries_and_imports.sql`
5. `20260817000270_phase1_profiling_configuration.sql`
6. `20260817000280_phase1_profiling_operations.sql`
7. `20260817000300_phase1_domain_containment.sql`
8. `20260817000310_phase1_function_execute_hardening.sql`
9. `20260817000400_phase1_completion_gate.sql`

All profiling changes are additive. The only legacy behavior removed is unsafe mutation/access explicitly replaced by the new scope: Admin domain roaming, institutional-partner mutations, legacy profile writes, raw household analytics, and hard deletion of governed records.

## Deployment gate

Before enabling the feature flag:

- prove Supabase credential rotation and reconcile the live migration ledger, columns, constraints, grants, policies, triggers, functions, buckets, and storage policies;
- replay Phase 0 and Phase 1 migrations on a disposable production-like clone;
- run direct JWT/PostgREST role tests, workflow concurrency tests, Auth redirect/invite tests, migration rollback rehearsal, and synthetic count reconciliation;
- configure the barangay code prefix, official sitios/aliases, effective Mother Leader assignments, privacy notice text/version, sampling dates/method/target, and official population source/as-of date;
- obtain institutional/barangay privacy approval, DPO/controller contact, retention rules, and correction/refusal procedures;
- keep `AGAPE_PROFILING_V2_ENABLED=false` and database runtime mode `off` until those checks pass;
- map or suspend every active `paraya_officer` and `barangay_official` identity while retaining its historical actor ID;
- use runtime mode `synthetic` only for explicit test-user and demo-barangay allowlists, then reconcile counts before considering `live`.

## Security and RLS impact

New PII tables revoke `anon` and `authenticated` table privileges and add restrictive false policies. Access is only through scoped RPCs. Director and Associate receive aggregates only; Admin, Finance, Volunteers, and legacy institutional roles receive no profiling access. Mother Leaders are assignment- and sitio-scoped. Secretary/Captain scope is their barangay, with Captain limited to approved packages. Researcher lifecycle corrections require an expected row version and immutable reason event.

Aggregate export is the only Phase 1 profiling export. It fails closed if the audit intent cannot be written, carries provenance/suppression metadata, and never reads resident tables in the route. There is no identifiable export endpoint.

## Background processing

`/api/cron/profiling-import-purge` calls the service-only purge RPC and requires `Authorization: Bearer <CRON_SECRET>`. Configure it daily after deployment. Profiling imports themselves remain synchronous under the locked capstone limits.

## Rollback

Set the database profiling runtime to `off`, keep `AGAPE_PROFILING_V2_ENABLED=false`, remove new navigation exposure, and stop the purge schedule while retaining normalized/versioned data. Do not roll back the deny-only capability model, Admin isolation, raw-AI prohibition, append-only history, or hard-delete retirement. Database rollback is forward-only: use a new corrective migration rather than dropping Phase 1 tables or restoring broad policies.

## Verification status

Local unit/source tests, typecheck, lint, and the production build are required on every change. The disposable-clone migration replay, direct JWT/PostgREST matrix, concurrency suite, Auth/browser E2E, storage-policy inventory, credential-rotation evidence, and synthetic reconciliation require a configured external Supabase test project and remain release gates—not items that can be inferred from source inspection.

## Deferred scope

AI recommendations, beneficiary estimation, unmet-need automation, OCR, blockchain, and complete demographic reporting remain outside Phase 1. Blockchain remains **Needs confirmation**, including Sir Paul’s required answer about the exact research problem and finalized records that need proof.
