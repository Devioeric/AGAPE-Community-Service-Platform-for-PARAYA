# Phase 1 Executable Security Matrix

This document maps mandatory executable cases to their reviewed suite definitions. It is not evidence that PostgreSQL, PostgREST, Auth, or Storage tests ran.

## Catalog and pgTAP

- `supabase/tests/database/phase1/01_catalog_security.sql` dynamically enumerates AGAPE-owned public tables and verifies RLS, permission mapping, capability helpers, fixed `SECURITY DEFINER` search paths, runtime-off state, Admin isolation, and removal of `PUBLIC`/`anon` Phase 1 function execution.
- `supabase/tests/seeded/phase1/01_fixture_security_invariants.sql` verifies deterministic synthetic identities, deny overrides, special Mother Leader states, and final runtime-off state.
- Each pgTAP file has a source test proving its plan equals its assertion count.

## Direct JWT/PostgREST matrix

`test/gates/phase1-security-scenarios.json` registers all nine approved login roles plus pending, inactive, suspended, deny-only, historical-only, cross-sitio, unassigned, and expired-assignment cases. Actual execution must use raw local Auth/PostgREST/RPC/Storage calls from `scripts/lib/release-gate-http.mjs`.

Every read, insert, update, delete, and RPC boundary must be measured independently. A denial passes only when it returns no unauthorized row and exact before/after domain and audit counts show no mutation.

## RPC abuse

The registered mandatory classes cover unknown/protected keys, JSON types, prohibited synonyms, categorical PII canaries, consent/minor/guardian contradictions, pregnancy periods, cross-cycle/sample/sitio/resident identifiers, stale versions, malformed imports, altered hashes, and forged totals.

Expected SQLSTATE and exact no-partial-write assertions must be attached to every concrete RPC scenario during canonical replay. A generic HTTP error alone is not a pass.

## Concurrency

The registered race set covers code allocation, create/submit, approve/return, duplicate/commit, revisions, transfer, death, merge, withdrawal/regrant, and cycle completion. Required acceptance is exactly one material winner, deterministic conflicts for stale losers, one immutable winning event, and zero partial graphs.

## Storage

The registered behavior set covers anonymous and unauthorized operations, parent/barangay binding, generated paths, traversal, size, MIME signatures, quarantine, signed-URL expiry, audited reads, and orphan compensation.

## Execution dependency

These definitions become executable only after the authoritative capture establishes the canonical baseline and the isolated local harness successfully replays Phase 1. Missing baseline, skipped mandatory cases, an unidentified Docker stack, remote endpoint, or absent exact-count assertion must fail the gate.
