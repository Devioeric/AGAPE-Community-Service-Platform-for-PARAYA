# AGAPE Development Rules

Before planning or modifying AGAPE:

1. Read `/docs/requirements/agape-scope-baseline.md`.
2. Confirmed requirements override Default adopted requirements.
3. Never change a Needs confirmation item into a final architectural assumption without flagging it.
4. AI must never automatically submit, approve, or reject proposals.
5. Never send identifiable resident data to AI.
6. Never place personal data on blockchain.
7. Preserve existing working functionality unless the new scope explicitly replaces it.
8. Inspect the current schema and implementation before proposing migrations.
9. Prefer incremental migrations over destructive rewrites.
10. Every plan must include tests, migration impact, security/RLS impact, and rollback considerations.
