# Canonical Migration Inventory and Baseline Runbook

## Purpose and current stop condition

This workflow inventories the repository without pretending that filenames can
reconstruct the live database. It prepares an authorized operator to capture the
real pre-Phase-0 schema, reconcile the live Supabase migration ledger, and prove
that a candidate canonical baseline replays to an equivalent schema.

It does **not** create `20260815000000_pre_phase0_baseline.sql`, apply SQL, contact
Supabase, move legacy files, or constitute release evidence.

At the time this workflow was added, the active directory contained 78 SQL
files: 25 timestamped migrations and 53 unordered legacy inputs. The canonical
baseline was missing. These counts are descriptive only; rerun the inventory for
the current result:

```powershell
node scripts/audit-migration-inventory.mjs
```

The strict form must remain failing until the live facts are reconciled, a real
baseline is verified, and unordered inputs are removed from the active migration
path:

```powershell
node scripts/audit-migration-inventory.mjs --check
```

## Deterministic classifications

The inventory uses filename structure only:

- `YYYYMMDDHHMMSS_slug.sql` is a timestamped migration and is ordered by its
  14-digit version.
- The exact expected baseline name is
  `20260815000000_pre_phase0_baseline.sql`. Its absence is a blocker; the tool
  never synthesizes its contents.
- `_COMBINED*.sql` is a legacy combined/manual artifact.
- Every other SQL filename is an unordered legacy input. Alphabetical order,
  filesystem timestamps, and comments such as "safe to re-run" are not accepted
  as application evidence.

Every file receives a SHA-256 checksum in `--json` output. Checksums identify the
repository bytes; they do not prove that those bytes were run in any database.

The preflight also fails on:

- duplicate 14-digit migration versions;
- combined scripts that embed SQL files also present individually;
- unordered replacements of `users_role_check` with different accepted roles;
- manual SQL-editor/paste-and-run artifacts in the active directory;
- a supplied live-ledger version that has no local timestamped file;
- a local timestamped gap at or before the latest captured live-ledger version;
- a canonical candidate containing an obvious top-level `COPY` or `INSERT`
  data load.

The current known conflicts include `_COMBINED_pending.sql` overlapping eleven
individual files and three incompatible unordered `users_role_check` rewrites in
`role_expansion.sql`, `finance_officer_role.sql`, and
`partner_roles_expansion.sql`. The final live constraint must be inspected; file
dates cannot decide which definition is authoritative.

## Authorized live-ledger capture

This step requires an authorized read-only database connection. Keep the output
in an approved private evidence location, never in the repository. Do not put a
password, access token, or connection string in a command argument, transcript,
or evidence document.

Capture the `version` column of `supabase_migrations.schema_migrations`, ordered
ascending, as plain text with one 14-digit version per line. Comments beginning
with `#` and blank lines are allowed. Then run:

```powershell
node scripts/audit-migration-inventory.mjs --ledger C:\private\agape-live-ledger-versions.txt --json
node scripts/audit-migration-inventory.mjs --ledger C:\private\agape-live-ledger-versions.txt --check
```

An absent local version or a gap before the latest applied version is a stop
condition. A timestamped version later than the latest applied version is merely
reported as pending. The special canonical-baseline version is excluded from
the ordinary gap calculation because whether it is ledger-repaired on an
existing environment is a deployment decision requiring the verified live
ledger.

For every unordered legacy input, record privately:

1. whether its exact checksum was applied, partially applied, superseded, or
   never applied;
2. the evidence source (ledger, SQL-editor history, schema comparison, or named
   reviewer); and
3. the live objects and policies that prove the conclusion.

Unknown does not mean unapplied. Do not rename unordered files into invented
timestamps or concatenate them into a baseline.

## Canonical schema capture

Use PostgreSQL 17 tooling to match the authoritative staging database and `supabase/config.toml`. Capture schema only
from the authoritative reconciled environment through an approved read-only
connection. Use the same `pg_dump` major version, schema list, and options for
the authoritative and replay captures. Keep owner-independent output, but retain
ACL/RLS-relevant statements so grants and policies are compared.

Example shape, with connection details supplied through an approved private
mechanism such as a task-specific environment variable or PostgreSQL service
definition:

```powershell
pg_dump --schema-only --no-owner --format=plain --schema=public --file C:\private\agape-authoritative-pre-phase0.sql $env:AGAPE_SCHEMA_SOURCE_DSN
```

Before treating the dump as a candidate source:

- inspect it for row data, credentials, tokens, contact lists, resident data,
  and environment-specific secrets;
- confirm the capture date, environment/project reference, PostgreSQL and
  `pg_dump` versions, schema scope, reviewer, and live-ledger checksum;
- inspect extensions, functions, triggers, constraints, grants, RLS enablement,
  and policies; and
- keep the raw authoritative capture outside the repository until its handling
  is approved.

The repository baseline may be created only from that reviewed authoritative
capture. This runbook intentionally does not provide generated SQL for it.

## Baseline replay and equivalence proof

1. Create a disposable empty PostgreSQL/Supabase clone of the approved version.
2. Apply only the reviewed canonical-baseline candidate to it.
3. Capture the same schemas from that clone with the identical dump options.
4. Compare the authoritative and baseline-only replay captures:

   ```powershell
   node scripts/verify-schema-equivalence.mjs --authoritative C:\private\agape-authoritative-pre-phase0.sql --replay C:\private\agape-baseline-replay.sql
   ```

5. A mismatch fails closed. The comparator removes only dump-version/timestamp
   headers, CRLF differences, trailing whitespace, repeated blank lines, and
   PostgreSQL `\restrict` session tokens. It does not sort statements or ignore
   policies, grants, constraints, or function bodies.
6. The comparator reports normalized SHA-256 values and the first differing line
   number without printing SQL contents. Review differences privately; do not
   weaken normalization to make a mismatch pass.
7. After baseline equivalence passes, apply timestamped Phase 0, Phase 1, and
   Phase 2 migrations in ledger order to another disposable clone. Capture the
   final schema, run seed validation, and execute migration, JWT/RLS, RPC abuse,
   concurrency, Storage, and browser suites.
8. Archive unordered legacy inputs outside `supabase/migrations` only after live
   reconciliation and reviewer sign-off. Preserve checksums and disposition in
   non-secret evidence.

Machine equality is necessary but not sufficient. A reviewer must still confirm
the intended role constraints, RLS semantics, function execution grants,
extensions, and migration-ledger repair plan.

## Evidence required before closing the gate

Record, without secrets or row data:

- authoritative environment and capture date;
- live ledger version-list checksum and reconciliation result;
- inventory JSON checksum and disposition of all unordered inputs;
- canonical candidate reviewer and source-capture checksum;
- baseline-only replay command, normalized hashes, and pass result;
- full timestamped replay and seed result;
- catalog/RLS/function-grant comparison and direct JWT tests;
- rollback rehearsal and named approval.

Generated inventory output is diagnostic, not proof that a live schema or
migration ledger was inspected.

## Migration, security, and rollback impact

This workflow changes no database schema, data, RLS policy, RPC grant, runtime
mode, or feature flag. It reads repository SQL and explicitly supplied private
captures. Schema-only inputs are rejected when an obvious top-level data load or
role-password statement is found, and SQL contents are not printed during a
comparison.

Rollback is removal of these local scripts, tests, and this runbook. It must not
delete an authoritative private capture, restore unordered SQL to an executable
path after it is properly archived, undo security hardening, or revoke an
already-rotated credential.

## Unresolved facts

The following remain **Needs confirmation from evidence**, not architectural
assumptions:

- the authoritative live schema and migration ledger;
- which unordered/manual files, or portions of them, were applied;
- whether multiple live environments diverged;
- the correct final live `users_role_check` definition before account cutover;
- the approved schema scope and storage location for private captures; and
- whether existing live ledgers require a reviewed `migration repair` after the
  canonical baseline is introduced.
