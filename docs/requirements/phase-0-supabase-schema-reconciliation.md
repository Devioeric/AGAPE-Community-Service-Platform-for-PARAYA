# Phase 0 Supabase Schema Reconciliation

Use this checklist before applying new AGAPE domain migrations. Its purpose is
to establish the deployed database as evidence, reconcile it with the
repository, and produce a reproducible migration chain without copying secrets
or live personal data into source control.

## Safety boundary

- Perform discovery with a read-only database role wherever possible.
- Authenticate through an approved local Supabase CLI session or a private
  password manager. Never paste a database URL, password, service key, JWT,
  `.env.local` content, or wallet secret into a command allowlist, document,
  terminal transcript, issue, or committed file.
- Write raw exports to an encrypted, access-restricted directory outside the
  repository. Schema exports can still reveal internal names and security
  design; treat them as sensitive.
- Export schema and metadata only. Exclude rows from `auth.users`,
  `public.users`, resident/profile tables, `storage.objects`, audit metadata,
  `vault`, and every application table.
- Do not change the linked project, run migration repair, or apply SQL during
  discovery. Take a managed Supabase backup before the eventual deployment.

## 1. Record the environment without credentials

- [ ] Record the date, operator, environment (`development`, `staging`, or
      `production`), Supabase project reference, PostgreSQL version, and local
      Supabase CLI version.
- [ ] Confirm the intended project in the Supabase dashboard before running a
      linked CLI command.
- [ ] Confirm the database role is read-only for discovery.
- [ ] Create a private artifact directory outside the repository and verify it
      is not synchronized to a public cloud folder.

Useful read-only CLI checks, after validating the installed CLI's help output:

```text
supabase --version
supabase status
supabase migration list --linked
```

If `supabase status` describes only a local stack, record that fact; do not
present it as evidence about the linked project.

## 2. Export the live definition

- [ ] Produce a schema-only dump for `public`, `auth`, and `storage`; do not use
      a data-only or seed export.
- [ ] Preserve owners, grants, revokes, default privileges, extensions,
      constraints, indexes, functions, function configuration, triggers, RLS
      enable/force flags, and policies in the private artifact set.
- [ ] Capture the following catalog views/definitions separately so omissions
      in a dump are visible:

| Area | Catalog evidence |
|---|---|
| Tables and columns | `information_schema.tables`, `information_schema.columns` |
| Constraints and indexes | `pg_constraint`, `pg_indexes` |
| Roles and grants | `pg_roles` (never `pg_authid`), `information_schema.table_privileges`, `column_privileges`, `routine_privileges`, `usage_privileges`, `pg_default_acl` |
| RLS | `pg_class.relrowsecurity`, `pg_class.relforcerowsecurity`, `pg_policies` |
| Functions | `pg_proc`, `pg_get_function_identity_arguments`, `pg_get_functiondef`, `prosecdef`, `proconfig` |
| Triggers | `pg_trigger`, `pg_get_triggerdef` (exclude internal triggers when reviewing application behavior) |
| Storage security | `storage.buckets` metadata plus policies whose schema is `storage`; never export object rows or files |
| Extensions | `pg_extension` |
| Migration ledger | `supabase_migrations.schema_migrations` and `supabase migration list --linked` |

- [ ] Hash each private artifact and record the hashes in the private review
      notes. Do not commit the raw artifacts or a hash file containing a secret
      project URL.

## 3. Inventory the repository migration chain

- [ ] List every file under `supabase/migrations` in exact filename order.
- [ ] Identify objects assumed to exist before the first committed migration.
- [ ] Identify duplicate object definitions, repeated policy names, conditional
      `IF EXISTS` behavior, destructive statements, and order-sensitive
      constraint rewrites.
- [ ] Compare `_COMBINED_pending.sql` with its component migrations. Treat it as
      a convenience artifact, not an independently applied migration, until its
      deployment history is proven.
- [ ] Do not edit a migration already present in the live migration ledger.

Known repository assumptions that require live verification:

- Foundational definitions for `public.users`, `public.barangays`, proposals,
  programs, and several other core tables are not present in the committed
  migration chain.
- `user_permissions.sql` creates an own-row UPDATE policy but, by itself, has no
  column-level protection for role, status, permissions, barangay, or
  organization fields.
- `audit_logs_columns.sql` previously gave authenticated administrators a
  `FOR ALL` audit policy rather than read-only audit access.
- `role_expansion.sql`, `finance_officer_role.sql`, and
  `partner_roles_expansion.sql` each rewrite the `users.role` constraint, so the
  live result depends on application order. The approved scope now removes
  institutional partner login roles, but that later migration must not be
  folded into Phase 0 without the confirmed account-mapping plan.
- Existing filenames are not a reliable timestamped deployment ledger. A file's
  presence does not prove that it was applied to the linked database.
- Application routes using the service role bypass RLS; policy reconciliation
  must be paired with API authorization and input-validation review.

## 4. Build the reconciliation matrix

For each table, column, constraint, index, policy, grant, function, trigger,
bucket, and migration version, classify it as:

- `Matched`: equivalent live and repository definitions.
- `Live only`: deployed but absent from migrations.
- `Repository only`: committed but not deployed.
- `Definition drift`: same object name with different behavior.
- `Order unknown`: final state depends on unproven execution order.
- `Needs confirmation`: intent cannot be inferred safely.

For every mismatch, record its security/RLS impact, dependent application code,
data-migration need, forward fix, verification query, and rollback. Never repair
the live migration ledger merely to make the lists appear equal.

## 5. Establish a reproducible baseline

- [ ] Recreate the reconciled schema in a disposable Supabase project without
      production data.
- [ ] Create a reviewed baseline migration for foundational live-only objects,
      then add timestamp-prefixed forward migrations for later changes.
- [ ] Preserve applied legacy files; use new corrective migrations rather than
      rewriting history.
- [ ] Apply grants and RLS explicitly. Test both allowed and denied actions with
      JWTs for every approved login role and with the service role.
- [ ] Verify functions use fixed `search_path` settings and least privilege.
- [ ] Verify private storage buckets and object policies independently of table
      RLS.
- [ ] Run schema-diff twice: once after rebuilding, and again after all Phase 0
      migrations. Both diffs must be understood before production deployment.

## 6. Phase 0 hardening deployment gate

The coordinated deployment order is:

1. Deploy the application authentication, invitation, recovery, strict mutation
   contracts, and service-authorized workflow routes in the same release window.
2. Apply `20260816000100_phase0_users_audit_hardening.sql`.
3. Apply `20260816000150_phase0_active_account_rls.sql`.
4. Apply `20260816000200_phase0_workflow_rls_hardening.sql`.
5. Refresh PostgREST's schema cache and run the negative/positive integration
   matrix before admitting normal traffic.

Do not deploy only the application or only the database portion: invitation
activation and proposal workflow behavior cross that boundary.

Before applying `20260816000100_phase0_users_audit_hardening.sql`:

- [ ] Deploy, or atomically release, the server-side invitation activation
      change. The old browser flow directly changes `status` and `is_active` and
      will be rejected by the new trigger.
- [ ] Confirm trusted account administration uses the service role only after
      authenticating and authorizing the administrator.
- [ ] Confirm normal self-profile updates are limited to `full_name`, `phone`,
      `notification_prefs`, and `updated_at`.
- [ ] Confirm no application path updates or deletes existing audit events.
- [ ] Confirm `audit_logs` is available before enabling account administration:
      sensitive account creation, invitation, activation, role/status, and
      password actions now persist an intent first and return
      `audit_unavailable` without mutating when that insert fails.
- [ ] Confirm account removal uses suspension/deactivation, not hard deletion.
      The audit log's existing `user_id ... ON DELETE SET NULL` relationship is
      intentionally unable to mutate an old audit event after append-only
      enforcement; referenced accounts must be retained.
- [ ] Apply first to a disposable clone, then staging, then production.
- [ ] Verify `proposal_reviews` has the columns used by the application,
      including `notes`, and inspect any `decision` check constraint. It must
      accept the immutable `submitted` and `prescreening_failed` event values
      before the workflow migration is applied.
- [ ] Verify the project proposal content columns referenced by
      `phase0_update_proposal_content` exist with the deployed types; the
      repository's foundational schema history is incomplete.
- [ ] Verify `program_signups` has the unique `(program_id, volunteer_id)` key,
      status and approval constraints, and every ownership/confirmation/audit
      column required by the Phase 0 trigger. Reconcile any legacy
      `approval_status = 'pending'` rows before retiring the old generic
      validation queue.
- [ ] Inventory every existing pending/suspended Auth identity and reconcile
      its Auth ban state. Middleware and RLS fail closed, but old identities
      should also be Auth-banned consistently.
- [ ] Inventory each Storage bucket's `public` flag as well as object policies.
      A restrictive authenticated-object policy does not make an already public
      bucket private or revoke public object URLs.
- [ ] Record dashboard evidence that the previously exposed Supabase
      secret/service credential was revoked. Never copy either old or new value
      into the reconciliation artifact.
- [ ] Add the deployed `/auth/callback` and `/accept-invite` URLs to the
      Supabase Auth redirect allowlist and verify both PKCE and implicit email
      templates in staging.

Post-deployment verification must show:

- [ ] An authenticated self-update of `full_name`, `phone`, and notification
      preferences succeeds.
- [ ] Authenticated changes to `role`, `status`, `is_active`, `permissions`,
      `barangay_id`, email, and organization ownership fail with SQLSTATE
      `42501`, including attempts by an authenticated Admin client.
- [ ] The trusted server-side administration workflow can still change those
      fields and records an audit event.
- [ ] Authenticated non-Admin users cannot read audit events.
- [ ] Authenticated Admin users can read/export but cannot insert, update,
      delete, or truncate audit events.
- [ ] The service role can insert an audit event but cannot mutate an existing
      event.
- [ ] Existing login, profile, invitation, user administration, and audit pages
      pass regression checks.
- [ ] A pending or suspended JWT cannot directly update `public.users`, read
      other user rows, or read/write any guarded application table through
      PostgREST; the pending user can read only its own invite-completion row.
- [ ] Former `office`, `student_org`, and `department` identities remain
      available for historical attribution but cannot write proposals,
      programs/activities, validation evidence, volunteer assignments, or
      volunteer-directory data.
- [ ] Active Volunteers can select only their own program signup, insert only a
      normalized self-owned pending signup, and update only
      `pending|confirmed -> withdrawn`; all ownership, approval, timestamp, and
      audit-field injection attempts fail.
- [ ] Concurrent Finance-clear requests yield one success, one stale-state
      conflict, and one immutable review event. Repeat for concurrent final
      decisions and edit-versus-submit.
- [ ] Proposal content plus SDG replacement rolls back as a unit after an
      injected child failure.
- [ ] Proposal submission and failed prescreening each append one review event.
- [ ] Direct authenticated writes to proposal reviews, proposal SDGs outside an
      editable parent state, program activities' protected fields, and
      validation evidence fail.
- [ ] Full backup export and restore commit return their Phase 0 disabled codes;
      no plaintext artifact or uploaded row is processed. Dry-run inspection
      remains non-mutating.
- [ ] Re-run the active-account policy installer or add an equivalent policy in
      every future migration that creates or newly enables RLS on a public
      table. Inventory `storage` policies separately.

## Rollback boundary

Prefer fixing forward. If the migration must be disabled during staging:

1. Use the database owner in a controlled maintenance window.
2. Drop only `protect_users_privileged_columns` or
   `audit_logs_append_only` after documenting the reason and retaining the
   application-side authorization fixes.
3. Restore the prior policies/grants only from the verified pre-deployment
   catalog export.
4. Never restore the unrestricted self-update exposure as a production
   workaround. Never modify or delete audit events created while the append-only
   control was active.

No rollback is allowed to restore public role selection, client-side account
activation, account takeover behavior, or unaudited privileged updates.
