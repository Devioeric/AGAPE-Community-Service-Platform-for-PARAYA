# Rollback rehearsal evidence template

Template-Only: true
Evidence-Status: DRAFT
Evidence-Result: NOT EXECUTED
Environment: disposable-clone
Executed-Date: YYYY-MM-DD
Operator: Full Name (Release Operator)
Reviewer: Different Full Name (Release Owner)
Release-Revision: <immutable-git-commit>
Evidence-Reference: <private-rehearsal-log-reference>
Artifact-SHA256: <64-hex-sha256>

Record runtime/flag shutdown, worker shutdown, denied writes/deliveries, retained
history, compatibility smoke results, recovery time, and forward-correction
procedure. Never restore broad RLS, hard deletion, or legacy writes.
