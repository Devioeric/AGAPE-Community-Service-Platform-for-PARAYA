# Phase 0 Decision Register

**Status date:** 2026-08-16  
**Authority:** `docs/requirements/agape-scope-baseline.md`

This register separates product decisions that are already safe to implement
from stakeholder decisions and deployment evidence that are still outstanding.
It does not replace the canonical scope baseline.

## Locked decisions

- The login actors are PARAYA Director, Associate, Researcher; Barangay Captain,
  Secretary, Mother Leader; Volunteer; Finance Officer; and System
  Administrator.
- DYCI offices, student organizations, academic departments, and external
  organizations are non-login Partner/Proponent records. Any of the three
  PARAYA officers may encode a proposal on their behalf.
- Finance may clear or return a budget but cannot approve or reject the project.
  Only the PARAYA Director makes the final approval or rejection, and rejection
  requires remarks.
- AI output is advisory. AI never submits, approves, or rejects a proposal and
  never receives directly identifiable resident data.
- The capstone profiles all usual residents in sampled households, subject to
  consent. Official barangay totals remain distinct from sample-derived totals.
- Biñang 2nd is the primary real-data pilot. The architecture remains
  multi-barangay.
- Personal data and complete documents never go on a blockchain. The AGAPE
  database remains the operational source of truth.

## Needs confirmation: blockchain

**Owner:** Sir Paul / panel  
**Blocks:** Blockchain provider, network, contract, wallet, proof records, and
research claims. It does not block Phases 0–7.

Ask Question 329 exactly:

> What exact research problem must blockchain solve in AGAPE, and which
> finalized record requires blockchain proof that cannot be sufficiently
> protected by the existing audit log?

The following baseline defaults remain provisional until that answer is
recorded:

- finalized approved proposals, finance-clearance/budget summaries, and final
  program/impact reports are the only candidate record classes;
- only a canonical hash plus minimal non-personal verification metadata is
  anchored;
- a test network and one system-managed institutional wallet are used;
- no tokens, cryptocurrency feature, user wallets, resident data, contact data,
  receipts, or complete documents are placed on-chain.

No blockchain dependency or schema should be selected before confirmation.

## Operational confirmation: reduced-account cutover

The non-login target is confirmed. Only the safe treatment of existing legacy
accounts and unfinished work is open. Before deactivation, PARAYA must approve:

1. the mapping from each `office`, `student_org`, and `department` identity to a
   Partner/Proponent organization and contact record;
2. the PARAYA officer responsible for every pending draft, submission, program,
   and volunteer assignment previously owned by those identities;
3. whether historical `created_by` actor identifiers remain visible in audit
   views alongside the new organization attribution;
4. the cutover date and whether legacy users receive a short read-only review
   window;
5. the contact email used for later proposal-status notifications; and
6. who signs off on reconciliation counts before accounts are suspended.

Until then, do not delete identities or rewrite historical actors. Phase 0
prevents new provisioning and operational writes while preserving historical
attribution.

## Operational prerequisites for resident profiling

These do not change the adopted data model, but must be supplied before real
resident data is imported:

- the authorized privacy notice/consent text, data controller/contact, purpose,
  retention period, correction channel, and refusal procedure;
- the approved sample design and profiling-cycle dates;
- the official sitio/purok list and Mother Leader assignments;
- the authorized source and “as of” date for official population/household
  totals; and
- the named PARAYA/Barangay personnel authorized for identifiable access,
  validation, sensitive export, and exceptional recovery.

## Deployment evidence required before Phase 0 production release

- Reconcile the live Supabase schema, grants, RLS, functions, triggers, migration
  ledger, buckets, and storage policies without exporting row data.
- Prove the ordered migrations in a disposable clone, including denied direct
  PostgREST actions for inactive and legacy roles.
- Configure and test the deployed Auth callback and invite redirect allowlists.
- Confirm any previously exposed Supabase service credential has been revoked
  and that replacement secrets exist only in ignored deployment/local secret
  stores.
- Run the concurrency, append-only audit, invitation, recovery, storage, and
  rollback tests in the reconciliation checklist.

Phase 0 remains locally implemented but not production-complete until this
evidence is recorded.
