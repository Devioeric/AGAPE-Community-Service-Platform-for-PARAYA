# Phase 5 Finance Integrity

## Purpose

Phase 5 adds provider-neutral, tamper-evident proof for the two finalized
financial records currently understood to match the panel request:

1. a Finance-cleared proposal budget snapshot; and
2. a Finance-verified program liquidation summary.

The feature proves that the canonical finalized record held by AGAPE matches the
commitment submitted to an external anchoring provider. It does not move money,
process payments, perform accounting, or make Finance decisions.

## Safety boundary

AGAPE remains the source of truth. Before any anchoring request, the database
creates an immutable canonical JSON snapshot and SHA-256 hash. The external
relay receives only the proof ID, source class, source version, canonical schema
identifier, and canonical hash.

The relay never receives line-item descriptions, payees, contacts, resident
data, receipts, attachment paths, complete budgets, complete liquidations,
passwords, or provider secrets. Ordinary users never manage a wallet and the UI
does not expose cryptocurrency, tokens, payment controls, or gas fees.

## Workflow

1. Finance clears an exact proposal budget revision or verifies an exact
   liquidation revision through the existing human workflow.
2. The database freezes the canonical snapshot and stores its SHA-256 hash.
3. Finance or the Director requests a proof using the current row version.
4. A gated worker claims the queued request with a lease.
5. In disposable synthetic mode, a deterministic local receipt is produced. In
   live mode, a configured HTTPS relay may submit the minimal commitment.
6. The worker records the receipt or a bounded retry-safe error code and appends
   an immutable event.
7. A public verification code exposes only the commitment, source class and
   version, validity state, and anchoring receipt.

If the budget is superseded or the liquidation is voided, the original proof is
not deleted. Its source validity changes to `superseded` or `voided`, preserving
the historical proof while making clear that it is no longer the current record.

## Authorization

- Finance and Director may read and request financial-integrity proofs.
- System Admin may configure runtime/provider metadata but cannot browse the
  underlying financial records through this feature.
- The public verification page reveals no budget values, narratives, parties,
  receipts, documents, or internal identifiers beyond the opaque proof code and
  version metadata.
- Direct table mutation is denied; reviewed, fixed-search-path RPCs enforce
  actor state, capability, runtime, source mode, expected version, and audit
  durability.

## Runtime and rollout

`AGAPE_FINANCE_INTEGRITY_V1_ENABLED` defaults to `false`. Database runtime
defaults to `off`. `synthetic` accepts only explicitly allowlisted actors and
sources. `live` also requires an approved provider and network configuration.

The current implementation deliberately does not choose a blockchain vendor,
network, contract, or institutional wallet. Those operational choices and the
formal research claim remain subject to panel and institutional approval.

Rollback sets the server flag and database runtime to off, stops the worker, and
retains all snapshots, hashes, receipts, validity changes, and immutable events.

## Deferred

- payment transfer and disbursement;
- cryptocurrency, tokens, and user wallets;
- individual expenditure anchoring;
- receipt/document anchoring;
- proposal-approval and final program/impact-report proof classes;
- a selected blockchain SDK, smart contract, network, or custody integration.
