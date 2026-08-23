# Phase 0: Security Containment and Schema Truth

## Objective

Make the existing AGAPE foundation safe and reproducible before adding resident-level profiling, advisory AI recommendations, expanded finance, volunteer proximity, or blockchain integration.

Phase 0 is an additive security release. It does not migrate resident data, implement blockchain, delete legacy partner identities, or begin the reduced-account data cutover.

The locked decisions, open stakeholder questions, and operational release
evidence are tracked in
`docs/requirements/phase-0-decision-register.md`.

## Implementation scope

1. Restrict public self-registration to a pending Volunteer account.
2. Never let public signup choose a privileged role, activate an account, enumerate Auth users, or mutate an existing account.
3. Keep privileged account provisioning behind the authenticated System Administrator invitation flow.
4. Replace proposal and program mass assignment with validated, explicit input contracts.
5. Keep proposal state, ownership, finance, approval, and reviewer fields behind dedicated human transition actions.
6. Enforce Finance-only budget clearance/return and Director-only final approval/rejection, including required rejection remarks.
7. Prevent ordinary users from changing privileged columns on their own `public.users` row.
8. Establish a repeatable live-Supabase schema, grant, RLS, function, trigger, storage-policy, and migration reconciliation procedure.
9. Add automated regression tests for the security boundaries introduced in this phase.
10. Require active application status at the API and direct PostgREST boundaries, including pending invitation sessions.
11. Make proposal transitions plus review events atomic and stale-state aware.
12. Disable plaintext full backup export and generic restore commits until a purpose-bound encrypted recovery design exists.
13. Keep former institutional login identities read/migration-compatible only; deny new provisioning and operational writes without deleting historical attribution.
14. Require a durable audit-intent entry before sensitive account, role,
    activation, invitation, or password mutations; fail closed if the audit
    store is unavailable.
15. Restrict identifiable legacy household-profile access to the Researcher and
    scoped Captain/Secretary roles until resident normalization and Mother
    Leader sitio assignments are implemented.

## Explicitly deferred

- Resident/household normalization and profiling-cycle migrations.
- Disabling or deleting existing institutional partner accounts. The non-login target is confirmed, but account-to-record mapping and cutover mechanics still require operational confirmation.
- Blockchain selection or implementation. Question 329 and the record/network boundary remain **Needs confirmation**.
- AI recommendation and automation work.
- Strict mutation contracts and transactions for the existing survey,
  donation/distribution, and impact/follow-up APIs. These were identified in
  the Phase 0 audit but are not dependencies of the account/proposal foundation.
- Program enrollment capacity, eligibility, schedule, invitation-link, and
  proximity rules. Phase 0 protects signup ownership and lifecycle fields;
  the complete matching/enrollment model belongs to the volunteer phase.
- Removing retired validation/delete controls from every legacy page. The
  server now fails closed; the affected UI should be replaced by lifecycle and
  revision actions during the corresponding module migration.
- Rewriting legacy research/wireframe documents such as
  `docs/scope-and-delimitation.md`, which still describe institutional login
  accounts and plaintext manual backup/restore. The canonical baseline already
  overrides them, but defense artifacts must be reconciled before submission.

## Migration impact

- Use three additive, ordered SQL migrations: account/audit protection, active-account RLS, then workflow/RLS/RPC protection.
- Do not drop columns, tables, identities, or historical attribution.
- Inventory the deployed Supabase schema before applying the migration because the repository does not contain a complete base-schema history.
- Apply the migration in a staging or cloned project first and retain a private, encrypted pre-migration schema/policy export.
- Deploy application and database changes as one coordinated release; the new proposal routes depend on the Phase 0 RPCs.

## Security and RLS impact

- Public signup produces only pending Volunteer accounts.
- Existing-user recovery remains solely in the password-recovery flow; signup cannot reset another account.
- Generic proposal/program writes cannot set workflow-controlled fields.
- Final proposal decisions require an authenticated PARAYA Director.
- Finance clearance/return requires an authenticated Finance Officer.
- Self-profile updates cannot alter role, activation, permissions, tenancy/assignment, or organization identity.
- Pending/suspended identities can inspect only their own account row for invite completion and cannot write through direct PostgREST.
- Proposal submission, warnings, review advancement, Finance actions, revision actions, and final decisions append review events in the same database transaction as state changes.
- Program activities, proposal SDGs, and validation evidence receive restrictive direct-write guards; dedicated server actions retain explicit authorization responsibilities.
- Program signups allow an active Volunteer to create only their own safe
  pending row or move their own pending/confirmed row to withdrawn. PARAYA
  assignments use the dedicated authorized route; Admin and former partner
  identities have no direct roster access.
- Program, activity, budget-line, proposal, validation-evidence, and legacy
  household-profile history cannot be hard-deleted through the contained APIs.
- Service-role routes remain responsible for explicit authorization and input validation because service-role access bypasses RLS.
- Manual community-validation attestation is retired; validation remains evidence-derived.
- Full browser-download backup export and generic uploaded-row restore commit are disabled in Phase 0. Dry-run file inspection and backup metadata remain available.

## Verification

- Run `npm test` for pure security contract and authorization regression tests.
- Run `npm run typecheck`.
- Run lint/build after targeted tests when the existing project configuration permits it.
- Exercise negative API cases for role injection, existing-email signup, protected proposal fields, unauthorized finance actions, and unauthorized final decisions.
- Apply the SQL migration to a disposable Supabase project or production clone and verify ordinary self-profile edits still work while privileged-field edits fail.
- Confirm privileged invitations and password reset still work end to end.
- Test concurrent proposal decisions and Finance clearance: one stale actor must receive `409`, with exactly one immutable review event.
- Verify former `office`, `student_org`, and `department` identities cannot create proposals/program activities, assign or enumerate volunteers, or mutate validation evidence.
- Verify active Volunteers can read only their own signup, cannot forge signup
  ownership/approval fields, and can only perform the one-way withdrawal
  transition through direct PostgREST.
- Verify sensitive account changes fail before mutation when the immutable
  audit store is unavailable, and append a successful outcome after mutation.
- Verify Supabase Auth redirect allowlists include the deployed `/auth/callback` and `/accept-invite` URLs.

## Rollback

- Application changes are independently reversible by route or feature, but rollback must never restore public privileged-role signup, existing-user mutation, or unrestricted mass assignment.
- Database rollback should restore the prior trigger/function/policy definitions only from a reviewed pre-migration export. Do not restore a policy that permits privileged self-escalation.
- Preserve all user, proposal, and program records; Phase 0 does not require data deletion.
- If a workflow correction blocks production unexpectedly, temporarily disable the affected action and use an audited authorized administrative recovery procedure instead of reopening broad update access.
- Rollback must not re-enable plaintext full exports, generic service-role restore upserts, manual validation flags, or institutional-account operational writes.

## Exit criteria

Phase 0 is complete when:

- public signup cannot create or activate a privileged account;
- signup cannot modify an existing Auth user;
- ordinary users cannot change privileged `users` fields;
- generic proposal/program writes reject or discard protected workflow fields;
- only Finance can clear/return budget and only the Director can finally approve/reject;
- the live schema and repository migration state are reconciled;
- automated security tests and type checking pass; and
- rollback artifacts and deployment order are documented;
- a disposable Supabase clone has passed migration, RLS, concurrency, invite, recovery, and append-only integration tests; and
- live migration/schema reconciliation has been completed before production deployment.
