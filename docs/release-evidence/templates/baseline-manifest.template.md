# Canonical baseline manifest template

Template-Only: true
Evidence-Status: DRAFT
Evidence-Result: NOT EXECUTED
Environment: disposable-clone
Executed-Date: YYYY-MM-DD
Operator: Full Name (Database Operator)
Reviewer: Different Full Name (Database Reviewer)
Release-Revision: <immutable-git-commit>
Evidence-Reference: <private-access-controlled-reference>
Artifact-SHA256: <64-hex-sha256>
Baseline-File: 20260815000000_pre_phase0_baseline.sql
Baseline-SHA256: <64-hex-sha256>
Authoritative-Dump-SHA256: <64-hex-sha256>
Replay-Dump-SHA256: <64-hex-sha256>
Migration-Ledger-SHA256: <64-hex-sha256>
Unexplained-Differences: <integer>
Object-Count: <positive-integer>
PostgreSQL-Version: <version>
Supabase-CLI-Version: <version>

## Reconciliation

Reference the private object matrix, baseline-cut decision, two clean replay
logs, and independently reviewed schema-equivalence result. Never attach a
data-bearing dump.
