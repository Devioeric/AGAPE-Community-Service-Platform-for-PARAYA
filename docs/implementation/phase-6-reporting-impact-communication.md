# Phase 6 — Reporting, Impact, and Communication

## Delivered boundary

Phase 6 completes the approved reporting, impact-measurement, and communication foundation without enabling an external provider in committed configuration.

- Reports are created and transitioned through version-checked RPCs. Review, return, approval, and archive append immutable lifecycle and audit events; hard deletion is unavailable.
- Approval freezes a canonical report snapshot and local SHA-256 hash. The record remains in AGAPE and is not automatically placed on a blockchain.
- AI narrative input is the strict `agape.reporting.aggregate.v1` contract. It contains approved operational counts and quality flags only—never resident records, contacts, receipts, document paths, or narrative source rows.
- Impact APIs return explicit field allowlists. `agape.impact.aggregate.v1` excludes named subjects, narratives, and notes from the aggregate surface.
- In-app notifications remain authoritative. Email and SMS preferences create governed outbox records, but delivery occurs only when the server flag and channel runtime are both enabled.
- External delivery uses leases, bounded retries, provider idempotency keys, immutable events, and explicit Admin requeue. Suppressed messages are never released merely because a provider was enabled.

## Authorization and privacy

`communication.provider.manage` belongs only to System Admin and maps to the communication permission module. Report reads and lifecycle operations retain their report capabilities. Direct mutation of report, delivery-runtime, outbox, and event state is denied; reviewed fixed-search-path RPCs enforce actor state and capability.

The provider adapter logs neither destinations nor provider response bodies. The committed defaults are:

```text
AGAPE_NOTIFICATION_DELIVERY_V1_ENABLED=false
email runtime=off
sms runtime=off
```

## Rollback

Set the server flag to `false`, set both channel runtimes to `off`, and stop the worker. Preserve reports, approved snapshots, hashes, outbox rows, attempts, and immutable events. Corrections after deployment use a later forward-only migration.
