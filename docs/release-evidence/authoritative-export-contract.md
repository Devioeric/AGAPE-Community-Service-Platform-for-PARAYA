# Sanitized authoritative export contract

An authorized database operator prepares these files in an encrypted private
directory outside this repository. The directory is supplied by path at
execution time and is never copied into Git.

Required inputs:

- `schema-only.sql`: application-owned public schema definitions with no rows;
- `migration-versions.txt`: one unique 14-digit ledger version per line;
- `tables-columns.json`;
- `constraints-indexes.json`;
- `extensions.json`;
- `functions.json`, including arguments, security mode, and `search_path`;
- `triggers.json`;
- `rls-policies.json`, including enable/force state;
- `grants-default-privileges.json`;
- `storage-buckets-policies.json`, excluding object rows and file contents.

Every JSON file must contain definitions or sanitized counts only. Exclude Auth
users, application rows, audit rows, resident data, contacts, documents,
receipts, connection strings, passwords, API keys, JWTs, and secret project
configuration.

Validate without printing contents:

```powershell
npm.cmd run db:validate-evidence -- `
  --schema C:\private\agape\schema-only.sql `
  --ledger C:\private\agape\migration-versions.txt `
  --catalog-dir C:\private\agape\catalogs
```

The command reports only sizes, hashes, version count, and validation problems.
Passing validates the file contract; it does not prove definitions are correct
or authorize a baseline.
