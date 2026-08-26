# Phase 2 Completion/Remediation Dark Launch

## Status and authority

Phase 2 is implemented as an additive, disabled foundation. It does not close
the Phase 1 release gate and is not authorized for shared or live deployment.
The narrative scope and confirmed baseline decisions remain authoritative.

Server flags and database modes are independent. A request succeeds only when
its server flag is exactly `true` and its database component is `synthetic` or
`live`. Every component defaults to `off`. Synthetic mode requires an active
test-marked user in the component allowlist; production data must not be used.

| Component | Server flag | Database component |
|---|---|---|
| Partner registry | `AGAPE_PARTNER_REGISTRY_V2_ENABLED` | `partners` |
| Historical programs | `AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED` | `historical_programs` |
| Structured proposals | `AGAPE_PROPOSALS_V2_ENABLED` | `proposals` |
| Program finance | `AGAPE_PROGRAM_FINANCE_V2_ENABLED` | `program_finance` |
| Contact email | `AGAPE_EXTERNAL_CONTACT_EMAIL_ENABLED` | `external_contact_email` |

Legacy-account Auth suspension has an additional application safeguard:
`AGAPE_LEGACY_ACCOUNT_SUSPENSION_ENABLED=false`. Development mapping sign-off
preserves the existing account and records only a pending request. Even when the
flag is temporarily enabled in a disposable test process, the database finalizer
accepts only allowlisted synthetic users and synthetic Partner roots; live
accounts require a separate future production change window.

## Architecture

The original six timestamped migrations plus forward-only remediation migrations
`20260818000700` through `20260818000750` are transactional. The first
aborts if the reconciled Phase 0/1 baseline is missing. Nothing in Phase 2
repurposes `barangays` or inserts retrospective rows into `programs`.

- `partner_entities` describes a non-login organization. A linked `barangay_id`
  connects an organization to geography without conflating the records.
- renewable `partnership_terms`, private document metadata, contacts, needs,
  program/proposal roles, and append-only events describe the relationship.
- legacy account mappings preserve original user and audit actor IDs. Mapping
  never merges entities or suspends an identity automatically.
- `historical_programs` has its own workflow, quality label, immutable versions,
  import staging, duplicate decisions, documents, and normalized links.
- `proposal_v2_profiles` overlays structured workflow state on existing proposal
  IDs without changing the unreconciled V1 status constraint.
- proposal targets, need snapshots, controlled beneficiaries, evidence-based
  estimates, immutable proposal versions, and workflow events form one graph.
- proposal and program budget revisions use PostgreSQL numeric values. Finance
  reviews exact submitted revisions and cannot edit line items.
- a unique `program_handoffs.proposal_id` enforces one program per proposal.
  Existing ambiguous links enter a reconciliation queue.
- program expenditure and liquidation rows are corrected or voided through
  events; no financial record is hard-deleted and no payment is processed.

## Authorization and privacy

The TypeScript and SQL capability maps add separate Partner-contact/document,
historical-program, proposal, handoff, budget-preparation/review, actual-recording,
and liquidation-review actions. Per-user JSON remains deny-only. Admin and legacy
institutional accounts receive no new operational capability.

New tables have RLS enabled and direct authenticated mutation revoked. Reviewed,
fixed-search-path RPCs check active account, capability, deny override, component
mode, expected version/state, and durable audit insertion. Public and anonymous
function execution is revoked. V2 routes return allowlisted DTOs and never call
`select("*")`.

Contacts and files never enter analytics or AI. Files are private, at most 10 MB,
quarantined initially, and require MIME/signature validation plus an authorized
short-lived signed URL. Live file release is blocked until malware scanning or a
documented risk acceptance and retention policy exist.

## Migration and compatibility

1. Reconcile the live ledger and generate the canonical timestamped baseline.
2. Replay baseline, Phase 0, Phase 1, and Phase 2 in a disposable clone.
3. Prove source/target counts before enabling synthetic registry mode.
4. Backfill one entity per barangay and preserve deprecated barangay fields as
   compatibility projections.
5. Generate candidate institutional mappings without automatic approval.
6. Map unfinished work, compare counts, sign off, then suspend—not delete—the
   login. V1 actor IDs remain unchanged.
7. Configure the official implementation date and source inventory before
   historical intake.
8. Shadow-compare scalar and normalized budgets before a V2 workflow cutover.

The compatibility `/api/partnerships`, proposal, program, and `/partner` summary
surfaces remain readable while V2 is disabled. V1 mutation authority is not
expanded. After a V2 transition, rollback is a forward correction or read-only
fallback, never restoration of permissive role/status constraints.

## Current implementation boundary

Implemented locally: target-bound synthetic/live runtime isolation; readiness
attestations and controlled V1/V2 mutation authority; corrected permission-table
mapping; private Storage buckets; quarantined upload and audited signed-download
boundaries; Partner detail/contact/renewal and mapping operations; historical
entry/edit/review plus streamed workbook staging, duplicate decisions and atomic
commit; atomic proposal graph editing; reproducible proposal/budget snapshots;
human-only proposal review; snapshot-based idempotent handoff; parent-bound
expenditure correction/void; itemized liquidation; Finance read DTOs; leased
contact-email processing; and strict API contracts. V1 writes are retired only
after the recorded V2 cutover, and original actor IDs are preserved.

Still release-blocked: the canonical pre-Phase-0 baseline, live-ledger evidence,
executable clone replay, direct JWT/RLS/Storage tests, concurrency and complete
browser E2E suites, synthetic count reconciliation, operational document
scanning/risk and retention approval, historical source inventory, and legacy
mapping sign-off. The current UI is an operational dark-launch workspace but the
full production-grade role-specific UX and external evidence remain acceptance
work. Source tests never substitute for these gates.

## Rollback

Set every Phase 2 database mode and server flag to `off`, stop outbox/reminder
jobs, and return reads to compatibility DTOs. Retain mappings, versions, events,
documents, imports, and financial history. Do not roll back RLS, audit
immutability, Admin isolation, institutional write revocation, or the prohibition
on automatic decisions.

## Deferred and unresolved

AI recommendations/drafting, automated unmet-need proposals, OCR, volunteer
proximity/invitations, payments, accounting replacement, cryptocurrency, and
blockchain are excluded. Sir Paul's exact blockchain research problem (Question
329) remains **Needs confirmation**; no personal or Phase 2 document data may be
placed on a blockchain.
