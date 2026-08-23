# Migration reconciliation evidence template

Template-Only: true
Evidence-Status: DRAFT
Evidence-Result: NOT EXECUTED
Environment: production
Executed-Date: YYYY-MM-DD
Operator: Full Name (Database Operator)
Reviewer: Different Full Name (Database Reviewer)
Release-Revision: <immutable-git-commit>
Evidence-Reference: <private-reconciliation-matrix-reference>
Artifact-SHA256: <64-hex-sha256>

## Baseline-cut branch

Record exactly one: no timestamped migration applied; historical pre-Phase-0
snapshot; or reviewed reverse attribution from current schema. Explain why the
other branches do not apply.

## Object matrix summary

| Classification | Count | Resolved | Open |
|---|---:|---:|---:|
| Matched | 0 | 0 | 0 |
| Live only | 0 | 0 | 0 |
| Repository only | 0 | 0 | 0 |
| Definition drift | 0 | 0 | 0 |
| Order unknown | 0 | 0 | 0 |
| Superseded | 0 | 0 | 0 |
| Needs confirmation | 0 | 0 | 0 |

Reference the private row-level matrix containing object, authoritative hash,
repository source, ledger evidence, dependency, security impact, baseline
treatment, forward fix, verification query, and rollback. Approval requires no
unresolved security-relevant or baseline-cut item.
