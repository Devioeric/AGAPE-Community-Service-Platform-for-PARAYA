# AGAPE external-control evidence runbook

This runbook tells authorized operators how to produce reviewable evidence
without committing secrets or personal data. It does not authorize production
changes.

## Required evidence envelope

Every executed evidence file must begin with these fields:

```text
Evidence-Status: APPROVED
Evidence-Result: PASS
Environment: staging
Executed-Date: YYYY-MM-DD
Operator: Full Name (Role)
Reviewer: Different Full Name (Role)
Release-Revision: immutable hexadecimal Git commit
Evidence-Reference: access-controlled private evidence identifier
Artifact-SHA256: SHA-256 of the referenced private evidence bundle
```

Use `disposable-clone`, `development`, `staging`, or `production` for the
environment. Placeholders, `TBD`, template warnings, role-only reviewers, future
dates, and missing references fail the automated gate. The reviewer must be a
named person different from the operator.

Start from [`templates/executed-evidence.template.md`](templates/executed-evidence.template.md)
or the relevant specialized template. Templates remain `Template-Only: true`
and must never be copied to an executed filename until the operation has actually
run and been independently reviewed.

## 1. Start fail closed

1. Identify the exact environment, project reference, release revision, change
   ticket, operator, reviewer, and maintenance window.
2. Confirm profiling and every Phase 2 server flag are `false`; profiling and
   every Phase 2 database runtime are `off`. Record sanitized results only.
3. Confirm an approved managed backup exists. Do not download row data into the
   repository.
4. Create an access-restricted evidence folder outside the repository. Record its
   identifier, not credentials or contents, in committed evidence.
5. Stop if the target is ambiguous, authority is missing, or a command would
   display credentials or production rows.

## 2. Credential rotation

Use the [credential template](templates/credential-rotation.template.md).

1. Inventory the exposed credential class and authorized consumers without
   copying its value, including local development, CI/CD, hosting, and jobs.
2. Revoke or rotate through the provider dashboard with an authorized owner.
3. Put replacements only in ignored local configuration and approved deployment
   secret stores; never in allowlists, screenshots, tickets, transcripts, or Git.
4. Restart or redeploy every consumer to discard cached credentials.
5. Privately prove the old credential is rejected and the replacement performs
   only its intended server operation. Record no value or authenticated request.
6. Scan tracked and untracked configuration using a method that reports only
   filenames/counts, never matched secret values.
7. Obtain independent dashboard review. Rollback must never reactivate the
   exposed credential.

## 3. Supabase Auth configuration

Use the [Auth template](templates/auth-configuration.template.md).

1. Establish canonical production and approved staging origins.
2. Configure the Site URL and exact `/auth/callback`, `/reset-password`, and
   `/accept-invite` URLs. Do not allow production wildcards or localhost.
3. Test success plus expired/reused token, wrong origin, inactive account, and
   role-safe invite completion.
4. Prove public signup cannot choose a privileged role or activate an account and
   legacy institutional roles cannot receive new operational invitations.
5. Keep redacted provider screenshots privately. Commit only path inventory and
   sanitized case results. Domain, provider, or flow changes expire the evidence.

## 4. Privacy and real-data approval

Use the [privacy template](templates/privacy-approval.template.md).

1. Identify the controller, DPO/privacy reviewer, purpose, lawful basis, pilot
   barangay, accountable office, processors, and notice version.
2. Review fields, prohibited data, consent/guardian and refusal handling, roles,
   correction/withdrawal, retention, deletion/anonymization, incidents,
   data-subject contact, export prohibition, and suppression.
3. Prove AI receives only approved aggregate/de-identified DTOs and no resident
   identity, contact, raw profile, or free-text medical information.
4. Verify import staging purge, backup, and observability retention procedures.
5. Store signed approval privately; commit only reference, scope, dates, and
   conditions. Approval for one scope never silently authorizes another.

## 5. Legacy-account mapping and suspension

Use the [mapping template](templates/legacy-account-mapping.template.md).

1. Inventory active `office`, `student_org`, and `department` identities by
   opaque actor ID and count attributed/pending work without exporting PII.
2. Create candidate non-login Partner/Proponent records. Never merge by name or
   rewrite original actor IDs.
3. Record each candidate mapping, responsible PARAYA officer, work disposition,
   notification plan, and discrepancy in the private register.
4. Require two-person review, explicit duplicate decisions, and count
   reconciliation. Never auto-merge or delete an identity.
5. Prove historical-read-only access and denial of resident, roster, forum,
   proposal, program, and finance mutations.
6. Suspend only after mapping, reassignment, notification, reconciliation, and
   Director sign-off. Preserve the UUID and all audit/history references.

The reduced-account target is confirmed; operational cutover evidence remains
required.

## 6. Rollback rehearsal

Use the [rollback template](templates/rollback-rehearsal.template.md).

1. Rehearse on a disposable production-like clone with synthetic data.
2. Record flags, runtimes, jobs, migration revision, and compatibility baseline.
3. Set affected flags and runtimes to `off`, stop workers, and prove new writes
   and external deliveries are denied or suppressed.
4. Verify normalized data, versions/events, audits, mappings, documents, and
   finance history remain intact and access-controlled.
5. Smoke-test compatibility and confirm Admin isolation, deny-only permissions,
   RLS, no hard deletion, and AI privacy remain enforced.
6. Document a forward correction or approved recovery path. Never drop governed
   tables, rewrite applied migrations, restore broad policies, reactivate an
   exposed credential, or restore legacy mutations.
7. Obtain release-owner review of recovery time, integrity, risks, and stop/go.

## 7. Submit evidence

1. Copy a template to the exact required filename only after executing the work.
2. Replace every placeholder, remove the template warning, and use the required
   envelope. Mark unresolved checks failed; do not omit them.
3. Keep raw artifacts private and reference them by access-controlled identifier
   plus the SHA-256 of the reviewed private artifact bundle.
4. Obtain independent review, then run both applicable release-gate checkers.
5. Treat a passing checker as envelope/digest validation. A release owner must
   still review the underlying evidence and authorize the release separately.

Environment, configuration, migration, processor, privacy notice, or mapped-set
changes expire the affected evidence and require a new review.
