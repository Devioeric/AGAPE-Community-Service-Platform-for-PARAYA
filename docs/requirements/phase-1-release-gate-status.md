# Phase 1 release-gate status

Status: **OPEN — local technical implementation is complete, but profiling must remain disabled.**

## Verified local state

- The canonical pre-Phase-0 baseline is active at
  `supabase/migrations/20260815000000_pre_phase0_baseline.sql` with SHA-256
  `e3d29ada8fa963f2af3dc7031a21575dd7d2d8a587d735b056c5d562ac1bce66`.
- All 53 unordered legacy SQL files, including `_COMBINED_pending.sql`, are
  preserved byte-for-byte under
  `supabase/legacy-migrations/pre-phase0-unordered/`. The active directory has
  39 timestamped migrations and no unordered SQL.
- Strict inventory against the sanitized staging capture passes with zero
  findings. No migration, DDL, or ledger repair was sent to a shared database.
- Two clean Phase 1 Docker/Supabase replays match at schema hash
  `13b7c02c3a61790f5699fec26ad9a00a38a788bf367a2b9020212643b25345ab`.
  Catalog assertions pass 15/15, fixture assertions 22/22, behavioral gates
  99/99, and legacy-development seed compatibility passes.
- Capability enforcement, deny-only overrides, Admin/legacy isolation,
  runtime-gated profiling, strict payload validation, stable versions,
  consent/lifecycle integrity, sampled-household containment, aggregate-only AI
  context, and immutable evidence are implemented through the forward-only
  Phase 1 chain.
- Researcher, Mother Leader, Secretary, Captain, Director, and Associate
  profiling workflows are implemented behind a disabled application flag and
  database runtime `off`.
- Local Supabase clients now use `sb_publishable_...` and `sb_secret_...` keys.
  Legacy JWT-based API keys are disabled, and authenticated Admin, statistics,
  and notification requests continued to succeed with the modern keys.
- The disposable authenticated browser gate passes 10/10. It exercises the
  complete Mailpit password-recovery flow through
  `/auth/callback?next=/reset-password`, server-cleared SSR sign-out, login with
  the changed password, and an administrator invitation that activates only the
  matching pending account through a narrow database proof and audited service
  transition.

## Remaining release blockers

- Freeze one immutable release candidate `R` and rerun every mandatory suite
  against that exact commit with zero failed or skipped cases.
- Supply the privacy-controller development approval inputs: approved notice,
  purpose/lawful basis, retention, correction, withdrawal, processors, incident
  handling, and synthetic-pilot scope.
- Supply the official sitio/assignment/sample configuration and sanitized
  legacy-account inventory with responsible officers. Existing development
  accounts remain preserved; real suspension is deferred.
- Create approved private result bundles and an outside-repository artifact
  index for the 15 registered Phase 1 evidence envelopes.
- Complete synthetic reconciliation, rollback, and explicit Phase 1
  development-readiness authorization against `R`.
- Commit only approved evidence Markdown as descendant evidence commit `E` and
  pass the strict verifier with the private artifact index.

These blockers are not waived tests. Solo-developer self-review may approve
development readiness only; it cannot authorize production or real resident
collection.

## Release-verifier behavior

The Phase 1 verifier requires exactly its 15 evidence artifacts and private
bundles. It permits the same evidence commit `E` to contain the 14 registered
Phase 2 evidence files so both gates can share one evidence-only descendant of
`R`. Any executable, unregistered, or other repository change between `R` and
`E` still fails closed.

## Migration, security, and rollback

All post-baseline corrections are additive and forward-only. Existing actor IDs,
profiling versions, lifecycle events, and audit history are preserved. Rollback
keeps `AGAPE_PROFILING_V2_ENABLED=false`, sets profiling runtime to `off`, stops
workers, and retains normalized data. It never restores Admin roaming, broad
RLS, direct PII access, legacy writes, or hard deletion.
