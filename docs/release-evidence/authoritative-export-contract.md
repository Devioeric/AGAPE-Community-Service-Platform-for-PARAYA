# Sanitized authoritative capture contract

An authorized database operator prepares one encrypted private directory outside
this repository. The model and repository tooling do not connect to production
to create it, and the directory is never copied into Git.

## Required layout

```text
capture-metadata.json
manifest.sha256
schema/public-schema.sql
ledger/versions.txt
ledger/catalog.json
catalog/tables-columns.json
catalog/constraints-indexes.json
catalog/functions.json
catalog/triggers.json
catalog/rls-policies.json
catalog/grants-default-privileges.json
catalog/extensions.json
storage/buckets.json
storage/policies.json
```

`capture-metadata.json` uses schema `agape.authoritative-capture.v1` and records a
capture ID, `staging` or `production`, a sanitized project reference, UTC capture
timestamp, named operator/role, PostgreSQL major version, Supabase CLI version,
schema allowlist, and the boolean `timestampedMigrationsApplied`.

`ledger/versions.txt` contains one unique, strictly increasing 14-digit version
per line. It may be empty only when metadata explicitly records
`timestampedMigrationsApplied: false`. `ledger/catalog.json` is a separately
sanitized catalog capture of the migration ledger; it contains no connection
details.

`manifest.sha256` contains exactly one line for each required file except the
manifest itself, in the form:

```text
<64 lowercase hex><two spaces><relative/path>
```

Every JSON file contains definitions, policy metadata, or sanitized counts only.
Exclude Auth users, application rows, audit rows, resident data, Partner contacts,
Storage object rows, documents, receipts, financial rows, passwords, connection
strings, API keys, and JWTs. The schema dump is schema-only and includes only
authorized application-owned `public` objects. Supabase-managed Auth and Storage
base tables are not copied; only AGAPE-owned bucket/policy metadata is captured.

Validate without printing contents:

```powershell
npm.cmd run db:validate-evidence -- --capture-dir C:\private\agape\capture
```

After a disposable replay produces the same capture structure, compare catalogs:

```powershell
npm.cmd run db:catalog-equivalence -- --authoritative-capture C:\private\agape\capture --replay-capture C:\private\agape\replay
```

The tools report identifiers, hashes, counts, and classifications—not SQL or row
contents. A passing contract check proves only that the bundle is structurally
safe enough for reconciliation. It does not prove correctness or authorize a
baseline, ledger repair, migration, or production change.
