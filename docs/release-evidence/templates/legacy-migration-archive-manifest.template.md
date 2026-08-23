# Legacy migration archive manifest template

Template-Only: true
Evidence-Status: DRAFT
Evidence-Result: NOT EXECUTED
Environment: development
Executed-Date: YYYY-MM-DD
Operator: Full Name (Migration Maintainer)
Reviewer: Different Full Name (Database Reviewer)
Release-Revision: <immutable-git-commit>
Evidence-Reference: <private-equivalence-approval-reference>
Artifact-SHA256: <64-hex-sha256>

Archive unordered SQL only after canonical schema equivalence is approved.

| Original filename | SHA-256 | Applied state | Superseded by | Notes |
|---|---|---|---|---|
| <legacy.sql> | <64-hex-sha256> | applied / not applied / unknown | <baseline or migration> | <reviewed disposition> |

The active migration directory must contain timestamped migrations only. The
archive remains non-executable and must never be passed to `supabase db push` or
executed as a batch.
