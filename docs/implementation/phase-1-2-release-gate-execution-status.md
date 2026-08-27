# Phase 1 and Phase 2 Release-Gate Execution Status

This is a non-authoritative execution ledger. It cannot satisfy either release gate.

## Release boundary

- Branch: `release/phase1-phase2-gate-closure`
- Starting revision: `03c8263074a750613558ca02880a1f368c55317c`
- Safe checkpoint revision: `1a1c73ceb8334f1b03b66f42af9d2d67928ce05c`
- Packet 0 intermediate revision: `6ddfda10f58b97c943ac7d148a6eb4e57441886e`
- Packet 2 intermediate revision: `854ce1e11e3b096fc4d6914a5debab8773fcee30`
- Packet 3 intermediate revision: `0e21c21c926b5001b6c78db1f107859efff63974`
- Packet 4 intermediate revision: `b35550ac09903ddc57ec9203b92f5cec578ce0ad`
- Packet 5 intermediate revision: `88625b13b52a5c21471c1806cd2e0d00ce19205d`
- Packet 6 intermediate revision: `867e58795224a650b111d0f64fa2fad0a1d54cc8`
- Packet 7 intermediate revision: `31872632cc4a432d24cb7530cc02f46f0823f433`
- Packet 8 intermediate revision: `5096b6d6409b428d69bb14dc21303e0bc3711463`
- Packet 9 intermediate revision: `7519be8fb27f4fb52a468649763f88b6f217b90f`
- Packet 10 intermediate revision: `16ca96b` (full hash retained in Git history)
- Packet 12 intermediate revision: `0863b42a6d023b1fc4225bede9286f40d8a9f7a2`
- Packet 13 intermediate revision: `8ef75b8` (full hash retained in Git history)
- Production/shared deployment authorized: No
- Profiling application flag: `false`
- Phase 2 application flags: `false`
- Database runtime evidence: Local executable verification complete; immutable-`R` self-attested evidence pending
- Mutation-authority evidence: Local executable verification complete; immutable-`R` self-attested evidence pending
- Real personal or financial data admitted: No

## Solo-development gate decision — 2026-08-26

- Repository owner confirmed there is no independent reviewer. Development-readiness evidence now uses named solo-developer self-review and explicitly records `Independent-Review-Performed: false`.
- Self-reviewed evidence can close the local/staging development-readiness gate only. It cannot authorize production activation or claim independent assurance.
- Existing Auth and application accounts must remain intact for development testing. Mapping sign-off records a pending suspension request; automated suspension is disabled unless an explicit test-only flag is enabled for allowlisted disposable synthetic identities.
- Live-classified identities cannot be suspended through the Phase 2 automated finalizer. Account deletion remains prohibited.

## Work packets

| Packet | Status | Result / blocker | Next exact action |
|---|---|---|---|
| 0 — Stabilize dirty tooling | locally_complete | Reviewed the post-checkpoint tooling set, corrected the recorded checkpoint hash, generated all 29 registry templates, fixed deleted-file handling in the inclusion scanner, and passed 122 tests, typecheck, lint, and the 155-route production build. The 60 manifest-approved paths were committed as `6ddfda10f58b97c943ac7d148a6eb4e57441886e`; the tree was clean afterward. | Preserve this checkpoint and begin Packet 1. |
| 1 — Human prerequisite lane | in_progress | Docker Desktop and its Linux engine are reachable. The operator states that the staging secret was rotated and that the sole remote AGAPE backend currently contains no real or operational personal/financial data. Reviewer separation is waived for development readiness; operator proof that the old credential fails, Auth configuration, privacy approval, implementation/source inventories, document-risk approval, and the final private evidence index remain pending. | Capture operator-verified old-credential rejection and the remaining staging approvals without claiming independent review. |
| 2 — Disposable database harness | locally_complete | Replaced the Phase 1 numeric cutoff with the reviewed `agape.database-gate-scopes.v1` manifest. The runner now uses explicit environment and file allowlists, exact CLI/PostgreSQL/project/port checks, forbidden-link detection, a fresh temp project per replay, exact-stack cleanup, outside-Git sanitized result bundles, and fail-closed process/TAP handling. Focused harness tests pass 14/14; the full suite passes 128/128, typecheck, lint, and the 155-route build. | Begin Packet 3 split fixtures and runner foundations. Docker replay remains blocked until Packet 1 prerequisites and the canonical baseline are available. |
| 3 — Split fixtures and runner foundations | locally_complete | Replaced the combined fixture with a Phase 1-only seed and a Phase 2 supplement, added phase-specific pgTAP integrity tests, and added loopback-only raw Auth/PostgREST/RPC/Storage, synchronized-race, scenario-ID, and exact-count helpers. Focused tests pass 20/20; the full suite passes 134/134, typecheck, lint, and the 155-route build. Docker-aware preflight reports only the missing canonical baseline and 53 unordered migrations. | Begin Packet 4 deterministic Phase 1 application corrections. Executable fixture replay waits for the canonical chain in Packets 7–8. |
| A — Freeze and checkpoint | locally_complete | Owner approved the inclusion manifest; 756 paths were staged explicitly, four synthetic secret-pattern fixtures were acknowledged, static checks passed, and checkpoint `1a1c73ceb8334f1b03b66f42af9d2d67928ce05c` was created without pushing. External credential rotation remains outstanding. | Authorized Supabase owner rotates/revokes the exposed credential before any connected work. |
| B — Evidence governance | locally_complete | One artifact registry now drives strict envelopes and 29 generated templates. Verifiers require full release commit R, clean evidence commit E, evidence-only R..E changes, explicit false flags, zero failures/skips, and an outside-repository private bundle index. Focused tests pass 8/8. | Begin Packet C tooling; do not create executed evidence until authoritative suites run. |
| C — Authoritative DB tooling | locally_complete | The versioned private-capture validator checks metadata, exact manifest hashes, schema-only safety, explicit empty-ledger semantics, catalog structure, capture IDs, PostgreSQL major, and credential-like material without returning definitions. A reproducible sanitizer now derives hash-only public/Storage catalogs from private schema-only dumps and allowlisted bucket metadata. The validated private capture reference is `AGAPE-STAGING-20260825-PACKET7`. | Preserve the private bundle and record solo-developer self-review; do not commit raw dumps or catalogs. |
| D — Canonical baseline | locally_complete | The exact validated PostgreSQL 17 candidate was promoted as `20260815000000_pre_phase0_baseline.sql` with SHA-256 `e3d29ada8fa963f2af3dc7031a21575dd7d2d8a587d735b056c5d562ac1bce66`. All 53 unordered files were moved byte-for-byte to the non-executable legacy archive; its manifest reconciles all 53 filenames and hashes. The active directory now contains 38 timestamped migrations and no unordered SQL. | Preserve the canonical bytes and archive hashes. A connected ledger-only proposal remains a separately authorized staging operation. |
| E — Disposable harness | locally_complete | Local harness hardening and phase-specific scopes are complete. Docker Desktop 29.7.2 with the Linux engine is reachable. The promoted active chain passes the Phase 1 gate at `d45c46a578f3cb65c8815bfd4e4de63749a7ade82c8e4f528f6de356d9ec0c4d` and the complete Phase 2 gate at `44b6a67d88d7d5997fa8a358c8f83e6550c0358ba209c7ed98da8867ea45e47a`. | Keep candidate mode only for private reconciliation diagnostics; authoritative development gates now use the promoted active chain. |
| F — Synthetic fixtures | locally_complete | The Phase 1 fixture executes with 22/22 integrity assertions. The Phase 2 supplement now executes with Partner, historical, proposal, budget, program-finance, and outbox roots; its three seeded suites pass 49/49 and retain explicit synthetic/live classification. | Preserve final runtime-off/V1 state and extend only when later vertical workflows require additional deterministic roots. |
| G — Executable security suites | locally_complete | Phase 1 catalog pgTAP passes 12/12 and its raw gate passes 99/99. Phase 2 catalog/runtime/Storage assertions pass 32/32, seeded workflow assertions pass 114/114, and the raw JWT, direct-table, RPC-abuse, concurrency, Storage, reconciliation, and rollback gate passes 83/83. | Preserve the executable definitions and rerun them against immutable candidate `R` before evidence approval. |
| H — Phase 1 workflows | locally_complete | Capability-specific profiling panels and authenticated synthetic workflows now cover Researcher, Mother Leader, Secretary, Captain, Director, and Associate boundaries. Seven serial Playwright/AI cases pass with profiling returned to off. | Retain disabled production state and obtain Packet 11 independent approval after an immutable candidate exists. |
| I — Phase 2 workflows | locally_complete | Runtime isolation and the Partner, legacy mapping, historical, structured proposal, Finance, handoff, program-finance, document, outbox, and reminder verticals are locally complete and executable through role-specific interfaces. | Preserve dark-launch state and rerun the complete suite against immutable candidate `R`. |
| J — Browser/AI interception | locally_complete | Phase 1 passes seven serial authenticated cases. Phase 2 passes six authenticated role/workflow cases; the loopback recorder received three permitted aggregate requests, rejected all Phase 2 canaries, and workflow fingerprints remained unchanged. | Keep real AI credentials absent from gate execution and repeat against immutable candidate `R`. |
| K — Reconciliation/rollback | locally_complete | Phase 1 reconciliation passes in its 99-case gate. Phase 2 exact Partner, legacy attribution, historical-quality, budget, handoff, reminder/outbox, final-off/V1, and governed-history preservation assertions pass in the 83-case behavioral gate. | Preserve additive history and repeat the rollback rehearsal against immutable candidate `R`. |
| L — Release evidence | blocked | Requires immutable candidate `R`, complete private artifacts, and solo-developer self-attestations. Independent review is not required for development readiness. | Do not claim production authorization; create executed evidence only after the remaining external inputs are captured. |

| 4 — Deterministic Phase 1 corrections | locally_complete | Locked the strict aggregate v2 sample contract to include nonparticipating households, returned actual submission row versions, removed hard-coded mutation versions, aligned Captain endorsement and minor derivation, preserved imported resident linkage, rejected normalized duplicate/unknown headers, and replaced direct service-role cycle reads with actor-scoped RPC-backed context. Focused tests pass 12/12; the full suite passes 137/137, typecheck, lint, and the 155-route build. | Packet 5 completed; retain the dedicated database RPC work for Packet 9. |
| 5 — Phase 1 role interfaces | locally_complete | Added a traceability matrix and extracted Researcher operations, structured Secretary review, and structured aggregate panels. Researcher browser controls now cover prefix, sitios, privacy notice, official snapshot intake, cycle creation, sample register/replacement, assignments, duplicate resolution, and expected-version lifecycle correction. Existing Mother Leader, Captain, and aggregate-only flows remain capability-separated. Focused tests pass 3/3; full suite passes 140/140, typecheck, lint, and the 155-route build. | Begin Packet 6 executable Phase 1 security-suite preparation. Authenticated execution remains pending canonical replay. |
| 6 — Phase 1 executable security definitions | locally_complete | Added dynamic Phase 1 catalog and seeded pgTAP, a versioned mandatory scenario registry covering all nine roles, account states, JWT boundaries, 16 malicious RPC classes, 10 races, and 15 Storage behaviors, plus strict definition/plan-count validation. Focused tests pass 3/3; full suite passes 143/143, typecheck, lint, and the 155-route build. These are reviewed executable definitions, not database execution evidence. | Packet 7 is blocked until credential rotation and the encrypted authoritative schema/ledger/catalog capture are supplied outside Git. |
| 7 — Authoritative reconciliation and baseline branch | locally_complete | Validated private capture `AGAPE-STAGING-20260825-PACKET7` against PostgreSQL 17: schema hash `e914ebeba42b1bc3b68c1d26a211aa737569c7ac62f81ad2d2240af7dafcd6c9`, zero timestamped ledger versions, 58 public tables, 4 extensions, 3 Storage buckets, and 4 AGAPE-owned Storage policies. Branch 1 is selected. The corrected hash-only 755-object reconciliation matrix has digest `9541c1685c44878e3ff02f58d7d1df79afdc1b24433d0d3e70c612297799bdc1`; Supabase-managed Storage table RLS is excluded from the application baseline. | Reconciliation is preserved privately; the exact baseline bytes are now promoted and locally verified. |
| 8 — Prove and promote canonical chain | locally_complete | The private schema-only candidate reproduced the authoritative public schema and all 755 AGAPE-owned catalog objects twice. Its exact bytes were promoted with SHA-256 `e3d29ada8fa963f2af3dc7031a21575dd7d2d8a587d735b056c5d562ac1bce66`; 53 unordered SQL files were archived with a verified filename/hash manifest. Strict inventory passes with 38 timestamped inputs and zero unordered inputs. The promoted Phase 1 and Phase 2 chains both pass clean two-cycle disposable replay. | Preserve the hash-bound archive and create the scoped local checkpoint; do not perform a connected ledger repair autonomously. |
| 9 — Phase 1 integrity migration | locally_complete | Added the forward-only effective-period integrity migration, narrow cycle/submission RPCs, half-open memberships and consents, overlap protection, versioned lifecycle/re-consent/correction behavior, effective aggregate selection, and explicit function grants/search paths. The candidate Phase 1 chain passes two clean replays with hash `60e601da1b4d49c66197ffd071903c507850416eb319077ab5eb5fb7d0dab178`, 12/12 catalog assertions, 20/20 seeded assertions, and the corrected legacy-seed compatibility check. Static verification passes 154/154, typecheck, lint, and the 155-route build. | Begin Packet 10 raw JWT/PostgREST, Storage, malicious RPC, concurrency, authenticated browser, AI interception, reconciliation, and rollback execution. |
| 10 — Phase 1 technical gate | locally_complete | Two clean Phase 1 replays match at `d45c46a578f3cb65c8815bfd4e4de63749a7ade82c8e4f528f6de356d9ec0c4d`; catalog pgTAP passes 12/12, fixture integrity 22/22, raw behavioral gates 99/99, and authenticated browser/AI workflows 7/7. Static verification passes 168/168, typecheck, lint, and the 155-route build. Final profiling state is off. | Packet 11 remains blocked only on immutable-candidate evidence and the non-reviewer external inputs. |
| 11 — Phase 1 external approval | blocked | Local technical checks are complete, but no immutable release candidate/evidence commit exists and credential invalidation proof, privacy/Auth evidence, and development-readiness authorization remain pending. Reviewer separation is waived and cannot be claimed. | Do not enable profiling; collect the remaining self-attested staging evidence against immutable `R`. |
| 12 — Phase 2 runtime/isolation corrections | locally_complete | Forward migration `20260818000850` closes fail-open runtime/cutover defaults, synthetic graph isolation, document path derivation, import lineage, handoff mode checks, explicit historical DTOs, and officer validation. Two clean candidate replays and all local checks passed before checkpoint `0863b42a6d023b1fc4225bede9286f40d8a9f7a2`. | Retain every component off and V1 authoritative. |
| 13 — Partner and legacy mapping workflows | locally_complete | Forward migration `20260818000860` and strict APIs complete contact, term, renewal, need, policy, merge, mapping-signoff, and recoverable synthetic Auth-suspension workflows. Two replays matched, database assertions passed, static tests passed 176/176, and the 156-page build passed before checkpoint `8ef75b8`. | Preserve the two-step real-account cutover boundary; real suspension remains a later authorized change window. |
| 14 — Historical-program workflows | locally_complete | Forward migration `20260818000870` adds atomic graph/version corrections, evidence-derived quality ceilings, staff-only detail, scoped aggregate summaries, one immutable duplicate resolution per import row, replacement-aware imports, retained idempotent counts, and staged-data purge. Two clean replays match at `ec9e6e431081f0083cbb514f409b736484ca2a81e3f8a80fc38e848ca5948b7a`; unseeded assertions pass 32/32, all seeded suites pass 49/49, legacy-seed compatibility passes, static tests pass 181/181, and typecheck/lint/157-page build pass. These are local technical results, not release evidence. | Checkpoint Packet 14, then begin Packet 15. |
| 15 — Proposals, budgets, handoff, program finance | locally_complete | Forward migration `20260818000880`, strict APIs/contracts, and the proposal-to-liquidation workflow are complete. Two clean Phase 2 replays match at `1a81561fbc291211a93329fc9ba194528d1152fcac2e139c9b977128fcd59744`; unseeded assertions pass 32/32, seeded workflows pass 90/90, legacy compatibility passes, static tests pass 188/188, and typecheck/lint/159-page build pass. | Checkpoint Packet 15 and begin Packet 16 role interfaces, Storage, and jobs. |
| 16 — Phase 2 interfaces, Storage, jobs | locally_complete | Forward migration `20260818000890`, role/capability-specific operational panels, target-bound document review, allowlisted finance/catalog reads, atomic email claim/finalize RPCs, and redacted delivery logging are complete. Two clean replays match at `73f14863d57f1d73378d2cf20647a4be73480831637985123f3690586d72f6c8`; unseeded assertions pass 32/32, seeded workflows pass 114/114, legacy compatibility passes, static tests pass 193/193, and typecheck/lint/161-page build pass. | Checkpoint Packet 16 and begin Packet 17 executable Phase 2 technical gates. |
| 17 — Phase 2 technical gate | locally_complete | After the solo-development account-preservation correction and canonical-baseline promotion, two clean Phase 2 replays match at `44b6a67d88d7d5997fa8a358c8f83e6550c0358ba209c7ed98da8867ea45e47a`; unseeded assertions pass 32/32, seeded workflows 114/114, behavioral gates 83/83, and legacy compatibility passes. Authenticated browser/AI scenarios previously passed 6/6. Static tests pass 199/199; typecheck, lint, and the 161-page build pass. Every final mode is `off`, both mutation authorities are `v1`, and existing development accounts are preserved. | Create the canonical-chain checkpoint. Packet 18 remains blocked on the non-reviewer external artifacts; do not designate `R` or start Phase 3. |
| 18 — Freeze R and close gates | blocked | Canonical promotion and local technical gates are complete. Immutable `R`, the private artifact index, operator-verified old-credential invalidation, Auth/privacy/configuration inputs, official inventories, document-risk/retention decisions, and solo-developer self-attested evidence remain required. Production remains unauthorized. | Do not designate `R`/`E` or proceed to Phase 3 until the remaining external inputs are captured and all authoritative suites are rerun against `R`. |

## Human prerequisite lane

| Required owner | Required artifact or action | Status |
|---|---|---|
| Supabase project owner | Rotate and revoke the potentially exposed credential; verify the old credential fails; provide sanitized Auth Site URL, redirect, invite, and recovery configuration evidence. | in_progress — operator reports rotation completed; operator-verified invalidation and Auth evidence pending |
| Database operator | Provide the encrypted `agape.authoritative-capture.v1` directory outside Git, including schema, ledger, catalog, grants, RLS, Storage metadata/policies, hashes, and a historical pre-Phase-0 snapshot when available. | locally_complete — private capture `AGAPE-STAGING-20260825-PACKET7` validates; solo-developer self-attestation pending |
| Independent database/security reviewer | Formerly required to review capture, equivalence, RLS, grants, and Storage. | waived for development readiness by repository-owner decision on 2026-08-26; no independent review may be claimed |
| Workstation owner | Install and start Docker Desktop using Linux containers so the disposable local Supabase harness can run. | locally_complete — Docker Desktop 29.7.2 Linux engine verified reachable on 2026-08-23 |
| Privacy Coordinator/DPO | Approve the notice, lawful basis, consent/refusal/correction/withdrawal procedures, processors, retention, incident handling, and synthetic-pilot boundary. | pending |
| PARAYA Director/Researcher | Provide the official AGAPE implementation date, historical-source inventory, legacy-account inventory, responsible officers, review cutoff, and notification procedure. | pending |
| Security/privacy owner | Approve document quarantine, MIME/signature validation, risk acceptance, access, and retention conditions; live document access remains disabled. | pending |
| Release owner | Provide the exact encrypted private evidence-store and artifact-index path outside the repository plus the named solo operator for each evidence class. | pending |

## Commands executed

- Read `AGENTS.md` and the complete scope baseline.
- Inspected the working tree with all untracked files: 747 entries.
- Verified six application flags are declared `false` in `.env.example`.
- Created local branch `release/phase1-phase2-gate-closure`.
- Generated `docs/implementation/release-gate-inclusion-manifest.json`: 753 entries, 540 included, 213 ambiguous, and four secret-pattern findings confined to security-test fixtures.
- Verified `.env.example` and ignored `.env.local` explicitly set all six application flags to `false` without printing any secret value.
- Verified `.env.local` and `.claude/settings.local.json` are ignored.
- Corrected gated profiling workers so cron authentication occurs before feature-state disclosure and both workers no-op when profiling is disabled.
- Recorded repository-owner approval for `ProcessFiles Paraya/`, `AGAPE-ERD.drawio`, and the four invalid security-test patterns.
- Final inclusion result before staging: 755 included, zero ambiguous, zero unresolved secret findings, and four acknowledged synthetic fixture findings.
- Ran the complete Node suite: 112 passed, zero failed, zero skipped.
- Typecheck passed.
- Lint passed with no warnings or errors.
- Production build passed and generated 155 routes/pages.
- Explicit staging selected only manifest-approved paths. Added binary Git attributes after Git warned that approved PDF/JPG artifacts could otherwise receive text conversion.
- Created safe checkpoint `1a1c73ceb8334f1b03b66f42af9d2d67928ce05c` on `release/phase1-phase2-gate-closure`; it was not pushed.
- Added a shared Phase 1/2 evidence artifact registry, full 40-character R/E revision checks, exact evidence-only diff validation, explicit release flag checks, and private encrypted-bundle digest verification.
- Generated 29 artifact-specific non-executable templates from the registry and corrected the Phase 1 evidence path in the Phase 2 status document.
- Evidence-governance focused suite passed 8 tests with zero failures/skips.
- Added the `agape.authoritative-capture.v1` private directory contract, exact SHA-256 manifest validation, explicit no-timestamped-migrations empty-ledger handling, and PostgreSQL-major enforcement; Packet 7 corrected the configured major from the provisional 15 to the authoritative staging major 17.
- Added `db:catalog-equivalence`, which reports stable object identifiers, definition hashes, classifications, counts, and a reconciliation-matrix digest without printing definitions.
- Authoritative-capture/catalog focused suite passed 6 tests with zero failures/skips.
- Added `test:db:phase1`, `test:db:phase2`, and sequential `test:db:gates` commands plus applied/full reconciliation-candidate replay that leaves active legacy files untouched.
- Added selected-migration temporary projects, additional remote Supabase variable stripping, and fail-closed loopback status checks.
- Disposable-harness focused suite passed 8 tests. Database preflight failed safely on the missing baseline, 53 unordered migrations, and unavailable Docker; no database operation ran.
- After Packets B/C and the local Packet E scaffolding, the complete Node suite passed 121 tests with zero failures/skips; typecheck, lint, and the 155-route production build passed.
- Packet 0 revalidation passed 122 tests with zero failures/skips, typecheck, lint, and the 155-route production build. Evidence template generation reported exactly 29 files.
- Regenerated the inclusion manifest with 59 included paths, zero ambiguous paths, zero unresolved secret findings, and three acknowledged synthetic-only findings. Fixed the manifest builder so an intentional tracked deletion is classified without trying to open the deleted file.
- Created Packet 0 intermediate checkpoint `6ddfda10f58b97c943ac7d148a6eb4e57441886e`; it was not pushed and the working tree was clean afterward.
- Started Packet 1. Verified the `docker` command is unavailable. Recorded every external prerequisite as pending without inspecting credentials or contacting Supabase.
- Added `supabase/database-gate-scopes.json`, which explicitly assigns migrations, database assertions, and fixture inputs to Phase 1, Phase 2, and reconciliation scopes. Later Phase 1 corrections must be added explicitly rather than inferred by timestamp.
- Hardened the disposable runner with exact Supabase CLI `2.114.0`, authoritative PostgreSQL 17, project ID, and port validation; a child-environment allowlist; forbidden link-metadata detection; reviewed-path-only copying; one fresh temporary project per replay; exact cleanup guards; mandatory TAP counts; and optional sanitized JSON result bundles outside Git.
- Packet 2 focused harness suite passed 14 tests. The full Node suite passed 128 tests with zero failures/skips; typecheck, lint, and the 155-route production build passed.
- Re-ran Phase 1 preflight. It failed safely before any database operation because the baseline and Packet 3 Phase 1 inputs are missing, 53 unordered SQL files remain active, and Docker is unavailable.
- Verified Docker Desktop 29.7.2 with WSL 2 and a reachable Linux/amd64 server. The Docker-aware preflight now fails only because the canonical baseline is missing and 53 unordered SQL files remain active; no migration, seed, reset, or evidence write was attempted.
- Replaced `release-gate-synthetic.sql` with the Phase 1-only `release-gate-phase1.sql` and Phase 2-only `release-gate-phase2-supplement.sql`. Added separate phase-specific seeded integrity tests and a Phase 1 cutoff smoke test.
- Added loopback-only raw Auth, PostgREST, RPC, and Storage helpers; synchronized race execution; sanitized scenario IDs; and exact before/after count capture/diff helpers.
- Packet 3 focused tests passed 20 tests. The full Node suite passed 134 tests with zero failures/skips; typecheck, lint, and the 155-route production build passed.

## Packet 4 implementation record

- Files changed: profiling public types and privacy schema, shared import-header validation, import parsing, actor-scoped server context, profiling API error normalization, submission/create/revise/import-preview routes, the profiling workspace, focused security tests, and this ledger.
- Migrations added or modified: none. The narrow database cycle-context and version-returning mutation RPCs remain reserved for the forward-only Packet 9 integrity migration after authoritative ledger reconciliation.
- Commands: focused Phase 1 contract/completion tests, complete Node suite, typecheck, lint, production build, targeted source scans, inclusion-manifest regeneration, and filename/count-only secret scan.
- Results: focused 12 passed; full 137 passed; zero failed/skipped; typecheck/lint/build passed. The first parallel typecheck overlapped Next.js build regeneration and failed on transient missing `.next/types` files; the required sequential rerun passed. No database replay was attempted.
- Security/RLS impact: direct service-role reads were removed from the affected profiling routes. Cycle context and post-mutation versions are resolved through authenticated actor-scoped RPCs and strict allowlisted projections. Database-side cycle-context narrowing remains pending Packet 9 and executable RLS/RPC proof remains blocked by the canonical chain.
- Rollback: revert only the Packet 4 checkpoint. No database, Supabase stack, Auth identity, Storage object, external service, evidence envelope, or runtime configuration was changed.
- External blocker: authoritative capture, credential/Auth evidence, canonical baseline, and independent approvals remain unavailable. Packets 7–10 cannot close until those artifacts pass validation.
- Next exact action: execute Packet 5 only, splitting the profiling workspace into capability-specific operational panels without starting Phase 2 or changing runtime flags.

## Packet 5 implementation record

- Files changed: `ProfilingWorkspace`, the new role-panel module, Phase 1 interface traceability, role-interface tests, the adjusted completion-gate source test, and this ledger.
- Migrations added or modified: none.
- Commands: focused role-interface tests, complete Node suite, typecheck, lint, and production build.
- Results: focused 3 passed; full 140 passed; zero failed/skipped; typecheck/lint/build passed; no authenticated browser or database suite was represented as executed.
- Security/RLS impact: browser controls call only existing capability-protected APIs. Secretary decisions require an opened allowlisted detail and an explicit return reason. Director/Associate analytics remain aggregate-only and the aggregate panel contains no resident drill-through or raw JSON display.
- Rollback: revert only the Packet 5 checkpoint. No database, Auth, Storage, worker, external service, evidence envelope, or runtime configuration was changed.
- External blocker: executable role/RLS/browser proof still requires the authoritative capture and canonical disposable chain.
- Next exact action: execute Packet 6 only, completing fail-closed Phase 1 pgTAP/JWT/RPC/concurrency suite definitions without claiming database execution.

## Packet 6 implementation record

- Files changed: dynamic Phase 1 catalog pgTAP, seeded fixture-invariant pgTAP, mandatory security-scenario registry and validator, focused source tests, executable-matrix documentation, package command, and this ledger.
- Migrations added or modified: none.
- Commands: security-definition validator, focused suite-definition tests, complete Node suite, typecheck, lint, and production build.
- Results: registry counts are 11 JWT, 16 RPC-abuse, 10 concurrency, and 15 Storage cases; focused 3 passed; full 143 passed; zero failed/skipped; typecheck/lint/build passed. PostgreSQL/PostgREST/Auth/Storage suites were not executed and no evidence was created.
- Security/RLS impact: the pgTAP catalog suite dynamically checks every application table, canonical module mapping, runtime-off state, fixed definer search paths, Admin isolation, and `PUBLIC`/`anon` execution removal. Concrete denial/no-side-effect and race assertions remain mandatory at execution time.
- Rollback: revert only the Packet 6 checkpoint. No database, Docker stack, Auth identity, Storage object, external service, evidence envelope, or runtime configuration was changed.
- External blocker: Packet 7 requires credential-rotation confirmation and a valid encrypted authoritative capture containing schema, ledger, catalog, grants, RLS, and Storage evidence. These have not been supplied.
- Next exact action: the authorized Supabase owner and database operator provide Packet 1 artifacts outside Git; then validate the capture and select the evidenced baseline branch in Packet 7.

## Packet 7 blocker record

- Files changed: this informational ledger only.
- Migrations added or modified: none.
- Commands: workspace search for the required private capture contract files and `npm.cmd run test:db:preflight` with access to the local Docker engine.
- Results: no private capture was found. Docker-aware preflight failed safely on the missing canonical baseline, the 53 non-timestamped active SQL files, and the Phase 2 scope reference to the missing baseline. It attempted no migration, seed, reset, database write, or evidence write.
- Blocking owner/artifact: authorized Supabase owner provides independent credential-rotation/revocation confirmation; authorized database operator provides the encrypted authoritative capture and ledger outside Git; a distinct database/security reviewer must be named.
- Why later packets cannot proceed: Packets 8–18 depend on the evidenced baseline branch, replayable canonical chain, forward-migration timestamp maximum, executable database results, or approved evidence. Proceeding would violate the no-guess and no-edit-applied-migration rules.
- Rollback: none required; preflight was read-only and fail-closed.
- Next exact action: validate the supplied private capture with `npm.cmd run db:validate-evidence -- <outside-repository-capture-path>`, then execute Packet 7 reconciliation if and only if it passes.

## Packet 7 technical completion record

- Files changed: PostgreSQL-major gate configuration, authoritative-capture/catalog sanitizers, the Storage bucket allowlist reader, explicit empty-ledger inventory handling, the object reconciliation matrix builder, focused tests, runbook wording, package commands, and this informational ledger.
- Migrations added or modified: none. The canonical baseline remains private and unpromoted; all 25 timestamped migrations are unchanged and all 53 unordered SQL files remain active pending Packet 8 equivalence approval.
- Private reference: `AGAPE-STAGING-20260825-PACKET7`; raw schemas, catalogs, Storage metadata, and the reconciliation matrix remain outside Git.
- Commands: schema-only public/Storage/full-extension dumps through pinned CLI 2.114.0; sanitized Storage bucket read; capture builder; `db:validate-evidence`; explicit-empty-ledger `db:inventory`; object reconciliation; focused Node tests; complete Node suite; typecheck; lint; production build; Docker-aware database preflight.
- Results: authoritative capture validation passed; PostgreSQL major is 17; ledger contains zero timestamped versions; baseline Branch 1 is selected. The public schema hash is `e914ebeba42b1bc3b68c1d26a211aa737569c7ac62f81ad2d2240af7dafcd6c9`. After excluding Supabase-managed Storage base-table RLS, the 755-object matrix digest is `9541c1685c44878e3ff02f58d7d1df79afdc1b24433d0d3e70c612297799bdc1`. Full static verification passed 147 tests with zero failures/skips, typecheck, lint, and the 155-route build.
- Security/RLS impact: no remote mutation occurred. Connected operations were schema-only dumps and allowlisted bucket metadata reads. The sanitizer emits identifiers, hashes, counts, function security/search-path flags, RLS state, grants, and policy metadata without raw definitions, keys, object rows, or application data.
- Rollback: revert only the Packet 7 technical checkpoint and delete the private capture through the evidence owner’s approved retention procedure. No database rollback is needed because no DDL, ledger repair, Auth mutation, Storage mutation, or application-data mutation occurred.
- External blocker: a distinct database/security reviewer and independent proof that the old credential fails remain mandatory. Packet 8 candidate replay may proceed locally, but baseline promotion, archive, and ledger proposal approval cannot.
- Next exact action: run the Packet 8 private candidate through two PostgreSQL 17 disposable replays and schema/catalog equivalence; stop before promotion unless a distinct reviewer approves the results.

## Packet 8 technical replay record

- Files changed: private baseline-candidate builder, authoritative/catalog validators, sanitized catalog capture, disposable replay runner, package command, migration regression tests, four ledger-proven-unapplied timestamped migrations, and this informational ledger.
- Migrations modified: `20260816000200` now introduces `program_signups.confirmed_at` before its dependent guards; `20260817000410` maps all authoritative legacy tables, including `chatbot_logs`, and enables RLS before installing the restrictive deny-only guard; `20260818000200` backfills authoritative V1 timeline columns without inventing a beneficiary count; `20260818000710` uses parse-safe explicit quality validation. The authoritative sole-backend ledger is explicitly empty, so these migrations are proven unapplied everywhere currently in scope.
- Private references: candidate hash `e3d29ada8fa963f2af3dc7031a21575dd7d2d8a587d735b056c5d562ac1bce66`; historical-equivalence bundle `packet8-full-equivalence-4`; complete-target bundle `packet8-full-target-replay-6`. All remain outside Git.
- Commands: private candidate build; two baseline-only disposable replays; authoritative public-schema and 755-object catalog comparison; iterative complete-chain replays; final two-cycle `reconciliation-full` replay; focused migration/harness/catalog Node tests.
- Results: both historical replays match the authoritative public schema and all 755 AGAPE-owned catalog objects. The complete Phase 0–2 chain succeeds twice with matching normalized schema hash `67c803b518fe7b72ef4865e0693887a881bad51272e3a4230ddc3d6edb098385`. Focused regression suite passes 49/49; full static verification passes 150/150, typecheck, lint, and the 155-route build with zero failures/skips. No remote DDL, ledger change, Auth mutation, Storage mutation, or application-row mutation occurred.
- Security/RLS impact: previously unprotected authoritative legacy tables now enable RLS and receive the canonical deny-only module guard. Chatbot history maps to `ai_assistance`; dormant discussion, participation, skill, qualitative, follow-up, and backup tables map to explicit modules and fail closed unless a permissive policy also authorizes access.
- Rollback: revert only the eventual Packet 8 Git checkpoint. Disposable stacks were identified and removed. Private bundles follow the evidence owner’s retention procedure. No governed or remote data needs rollback.
- External blocker: a distinct database/security reviewer must approve historical equivalence before the private baseline is promoted or the 53 unordered SQL files are archived. Independent old-credential invalidation also remains pending.
- Next exact action: run full static checks and checkpoint the locally proven Packet 8 tooling/corrections, then implement Packet 9 locally against the private candidate while promotion approval is pending.

## Packet 9 implementation record

- Files changed: the Phase 1 replay scope, disposable candidate-mode runner, actor-scoped profiling server context, legacy compatibility seed, Phase 1 catalog pgTAP, focused contract/integrity tests, and this informational ledger.
- Migration added: `20260818000800_phase1_effective_period_integrity.sql`. It is a new transactional forward migration after the existing chain; no timestamped migration was rewritten in Packet 9.
- Commands: focused Node tests; legacy-seed-only disposable diagnostics; complete Phase 1 candidate gate; complete Node suite; typecheck; lint; production build.
- Results: two clean Phase 1 replay schemas match at `60e601da1b4d49c66197ffd071903c507850416eb319077ab5eb5fb7d0dab178`; catalog pgTAP passes 12/12; reviewed fixture assertions pass 20/20; legacy development seed compatibility passes; static tests pass 154/154; typecheck, lint, and the 155-route build pass with zero failures/skips.
- Security/RLS impact: current resident selection is effective-date and consent aware; completed evidence remains immutable; direct legacy-household writes remain blocked; sensitive RPC execution is explicitly revoked then allowlisted; definer functions use fixed safe search paths; lifecycle and correction operations bind actor, capability, scope, runtime, expected version, and audit events.
- Compatibility impact: the optional legacy development seed now projects obsolete columns into the authoritative schema, uses service-role claims only inside the validated disposable compatibility session, omits forbidden legacy-household writes, and maps retired follow-up statuses. It is not release data or release evidence.
- Rollback: set profiling runtime to `off` and keep the migration/data in place. Revert the local Packet 9 checkpoint only before deployment; never restore inclusive periods, overlapping active memberships/consents, direct legacy writes, broad RPC grants, or mutable completed evidence.
- External blocker: baseline promotion/archive, approved release evidence, and gate closure still require a distinct reviewer and independent old-credential invalidation. Packet 10 technical execution may continue locally.
- Next exact action: implement and execute Packet 10 behavioral JWT/PostgREST, Storage, malicious RPC, concurrency, browser, privacy, reconciliation, and rollback suites against the disposable Phase 1 candidate chain.

## Packet 10 implementation record

- Files changed: raw Phase 1 Auth/PostgREST/RPC/Storage runner, authenticated browser/AI runner and serial Playwright spec, strict aggregate fixture/reconciliation, profiling role panels and stable selectors, allowlisted sample/submission-detail adapters, database-gate orchestration, compatibility seed, focused tests, and this informational ledger.
- Migrations added: `20260818000810_phase1_stable_submission_creation.sql`, `20260818000820_phase1_private_storage_boundary.sql`, `20260818000830_phase1_submission_detail_boundary.sql`, and `20260818000840_phase1_ai_report_compatibility.sql`. All are forward-only additions after the existing Phase 1 scope; Packet 10 did not rewrite an applied migration.
- Commands: focused Node and syntax checks; two complete candidate replays; catalog and seeded pgTAP; raw role/CRUD/RPC/race/Storage/reconciliation/rollback gates; legacy development seed compatibility; authenticated Playwright and loopback AI interception; complete Node suite; typecheck; lint; production build.
- Results: two clean schemas match at `d45c46a578f3cb65c8815bfd4e4de63749a7ade82c8e4f528f6de356d9ec0c4d`; catalog 12/12, fixture 22/22, behavioral 99/99, browser/AI 7/7, and static 168/168 all pass with zero failures/skips. Typecheck, lint, and all 155 build routes pass. The legacy seed compatibility replay succeeds.
- Security/RLS impact: stable submission creation locks the selected sample; private reports Storage no longer inherits broad volunteer policies; submission detail is runtime-, capability-, ownership-, barangay-, and status-scoped with fixed DTOs and durable read audit; AI payload recording rejects resident canaries and workflow fingerprints prove no proposal/program transition; final profiling runtime is off.
- Reconciliation/rollback: the completed evidence payload is strict and hash-bound, uses a non-future verified official source, reconciles one active household and two effective residents, preserves sample outcomes, and contains no resident identity keys or values. Rollback proof retains governed counts while runtime-off RPC, direct table, and Storage writes fail closed.
- External blocker: these are local technical results, not approved release evidence. Packet 11 still requires an immutable release candidate, a distinct reviewer, independent old-credential invalidation, privacy approval, Auth evidence, and the other registered external artifacts.
- Next exact action: create the Packet 10 development checkpoint, keep Packet 11 blocked, and begin Packet 12 Phase 2 runtime/cutover/DTO/isolation correction locally against the private candidate.

## Packet 2 implementation record

- Files changed: `supabase/database-gate-scopes.json`, `scripts/lib/database-gate-config.mjs`, `scripts/lib/local-database-gate.mjs`, `scripts/run-local-database-gates.mjs`, `test/security/local-database-gate.test.mjs`, `TESTING.md`, and this ledger.
- Migrations added or modified: none.
- Commands: focused Node test, JavaScript syntax checks, Phase 1 database preflight, full `npm.cmd test`, typecheck, lint, and production build.
- Results: focused 14 passed; full 128 passed; zero failed/skipped; typecheck/lint/build passed; database replay not run.
- Security/RLS impact: no policy or schema change. The harness now prevents remote credentials/links/endpoints, unreviewed files, wrong ports/projects, unsafe cleanup, and in-repository result bundles from entering an executable database run.
- Rollback: revert only the Packet 2 checkpoint. No database, Docker stack, external service, evidence envelope, or runtime configuration was changed.
- External blocker: Docker Desktop/Linux engine, authoritative capture, and canonical baseline remain unavailable. Required owners are listed in the human prerequisite lane.
- Next exact action: create the split Phase 1 fixture and Phase 2 supplement plus raw HTTP/race/Storage runner foundations in Packet 3.

## Packet 3 implementation record

- Files changed: split synthetic fixtures, Phase 1/Phase 2 seeded pgTAP integrity tests, Phase 1 database cutoff smoke test, `scripts/lib/release-gate-http.mjs`, its focused security tests, the database-harness fixture contract test, and this ledger.
- Migrations added or modified: none.
- Commands: JavaScript syntax check, focused Node tests, full `npm.cmd test`, typecheck, lint, production build, sandboxed preflight, and Docker-aware preflight.
- Results: focused 20 passed; full 134 passed; zero failed/skipped; typecheck/lint/build passed; Docker-aware preflight reached canonical-chain checks and failed safely only on the missing baseline and 53 unordered migrations.
- Security/RLS impact: no policy or schema change. Phase 1 seed execution no longer depends on Phase 2 tables. HTTP test helpers reject remote origins and non-synthetic authentication identities and do not expose keys in their result shape.
- Rollback: revert only the Packet 3 checkpoint. No database, Supabase stack, Auth identity, Storage object, external service, or runtime configuration was changed.
- External blocker: the authoritative capture, canonical baseline, credential/Auth evidence, and independent approvals remain unavailable. Packet 7 cannot start until those artifacts pass validation.
- Next exact action: execute Packet 4 only, correcting deterministic Phase 1 DTO/version/minor/import/cycle-context defects without adding or changing a database migration.

## Packet 12 implementation record

- Files changed: per-component runtime capability mapping and routes, server-derived document paths, Phase 2 replay scope, trusted split fixture/bootstrap handling, Phase 2 runtime pgTAP, fixture-only harness diagnostics, focused source tests, and this ledger.
- Migration added: `20260818000850_phase2_runtime_isolation_corrections.sql`. It is a new transactional forward migration after the complete existing chain; no previously applied migration was rewritten in Packet 12.
- Commands: repeated fixture-only disposable diagnostics; focused Phase 2/harness tests; complete two-cycle Phase 2 candidate replay; unseeded catalog/runtime/Storage pgTAP; seeded Phase 2 fixture assertions; legacy development seed compatibility; complete Node suite; typecheck; lint; production build.
- Results: two clean Phase 2 schemas match at `30bccef90c85aa7c34598aea334bfe486a9210481adf2958c98b6e367ee5d1f7`; catalog/runtime/Storage assertions pass 32/32; seeded Phase 2 fixture assertions pass 10/10; focused tests pass 30/30; full static tests pass 173/173; typecheck, lint, legacy seed compatibility, and all 155 build routes pass with zero failures/skips.
- Runtime/security impact: absent or unknown runtime/cutover state fails closed; configuration uses component-specific capabilities; live mode requires readiness attestations; synthetic actors and roots are both allowlisted; imports bind immutable data mode and replacement lineage; handoff observes proposal and program-finance modes; document paths bind parent/content hash/MIME; historical detail is an explicit allowlisted DTO; private helpers are not executable by `PUBLIC`, `anon`, or `authenticated`.
- Compatibility correction: authoritative `programs.proposal_id` remains a legacy link to `proposals`. A separate `programs.project_proposal_id` now references current `project_proposals`; routing and composite handoff constraints prevent ambiguous or cross-proposal reinterpretation without rewriting historical links.
- Rollback: set every Phase 2 runtime to `off`, retain V1 mutation authority, stop workers, and keep the additive schema/history. Before deployment, revert only the Packet 12 checkpoint. Never restore fail-open runtime defaults, caller-selected paths, mixed-mode graphs, or ambiguous proposal links.
- External blocker: these local results are not approved release evidence. Packet 11 and final Packet 18 still require a distinct reviewer, independent old-credential invalidation, baseline promotion approval, privacy/Auth/document-risk evidence, and the other registered human artifacts.
- Next exact action: checkpoint Packet 12, then audit and complete Packet 13 Partner and legacy-mapping vertical workflows against the executable candidate chain.

## Packet 13 implementation record

- Files changed: strict Partner contracts; Partner contact, term-transition, merge, need-link, policy, detail, and mapping APIs; Phase 2 fixtures and seeded Partner workflow pgTAP; replay scope; focused tests; and this ledger.
- Migration added: `20260818000860_phase2_partner_vertical_completion.sql`. It is additive and forward-only. Existing Partner, proposal, program, and actor identifiers are preserved.
- Commands: focused contract/source tests; repeated fixture-only replay diagnostics; complete two-cycle Phase 2 candidate replay; catalog/runtime/Storage pgTAP; seeded Partner workflow assertions; legacy development seed compatibility; complete Node suite; typecheck; lint; and production build.
- Results: two clean schemas match at `607059140ece9c78588faad873f9154d8cc228a3cf1e0ca66d50fbd63dae662e`; unseeded database assertions pass 32/32; seeded assertions pass 26/26; focused tests pass 24/24; full static tests pass 176/176; typecheck, lint, legacy seed compatibility, and all 156 generated build pages pass with zero failures/skips.
- Security/RLS impact: contacts retain exactly one active primary; all changes use expected versions and immutable events; term transitions are state/effective-date checked; merges require non-self compatible synthetic/live roots; need evidence is parent-bound; policy changes are Director-only and prospective; relationship detail omits Storage paths and audits each read.
- Legacy cutover correction: mapping sign-off now records `signed_off/requested` without deactivating the application account. Only a service-role finalizer may align application status after Auth succeeds; it independently verifies the named active operator, deny override, component mode, and synthetic actor/entity allowlists. Auth failure records a bounded code and leaves the historical-read-only application account active for retry.
- Rollback: set Partner runtime `off`, retain V1 authority, stop suspension processing, and preserve mapping requests/events. Before deployment, revert only the Packet 13 checkpoint. Never restore direct mapping/contact/term mutations or the former false-suspension ordering.
- External blocker: no real institutional account was suspended. Production cutover, baseline promotion, and release approval remain blocked on the distinct reviewer and registered external evidence.
- Next exact action: checkpoint Packet 13 after full static verification, then complete Packet 14 historical-program correction/import/evidence/analytics operations.

## Packet 14 implementation record

- Files changed: strict historical create/update/duplicate contracts; canonical XLSX/paired-CSV catalog and parser; create/detail/workflow/template/preview/duplicate/batch/analytics APIs; public quality-aware DTOs; Phase 2 fixture and scope; seeded pgTAP; focused source tests; and this ledger.
- Migration added: `20260818000870_phase2_historical_vertical_completion.sql`. It is a new transactional forward migration; no previously applied migration was edited.
- Commands: focused Node tests; repeated disposable fixture diagnostics; the complete two-cycle Phase 2 candidate gate; catalog/runtime/Storage pgTAP; all seeded Phase 2 workflows; legacy development seed compatibility; complete Node suite; typecheck; lint; and production build.
- Results: two clean replay schemas match at `ec9e6e431081f0083cbb514f409b736484ca2a81e3f8a80fc38e848ca5948b7a`; unseeded assertions pass 32/32; all seeded suites pass 49/49; focused tests pass 26/26; static tests pass 181/181; typecheck, lint, legacy compatibility, and all 157 generated pages pass with zero failures/skips.
- Integrity/security impact: draft and returned corrections replace the complete scalar/junction graph under one parent lock and create a canonical immutable version; evidence provenance limits quality; unknown dates stay draft; detailed narratives/evidence are limited to operational historical capabilities; Captain/Secretary use aggregate-only, barangay-scoped metrics; obsolete weaker mutation RPCs are revoked.
- Import impact: normalized duplicate/unknown/prohibited headers fail; Programs/SDGs/Needs share the versioned catalog; replacements bind prior batches; one immutable row-level resolution controls all candidates; ready-only commit is locked and idempotent; commit retains exact counts while purging payloads, row keys, errors, and comparison candidates.
- Rollback: set historical runtime `off`, stop purge/intake workers, retain programs, versions, events, resolutions, batch metadata, and documents, and use compatibility reads only. Before deployment, revert only the Packet 14 checkpoint; never restore direct mutations, mutable review versions, conflicting duplicate decisions, or mixed verified/unverified totals.
- External blocker: baseline promotion/archive, release evidence, and production activation remain blocked on independent review, credential invalidation proof, privacy/Auth/document-risk evidence, official implementation/source inventory, and final authorization.
- Next exact action: checkpoint Packet 14 and begin Packet 15 proposal/budget/handoff/program-finance completion locally.

## Packet 15 implementation record

- Files changed: strict proposal, planning-estimate, budget, allocation, expenditure, and liquidation contracts/types; proposal catalog, estimate, graph, workflow, Finance, handoff, allocation, expenditure, and liquidation APIs; Phase 2 fixtures/scope; seeded pgTAP; focused source tests; and this ledger.
- Migration added: `20260818000880_phase2_proposal_finance_vertical_completion.sql`. It is a new forward-only migration; Packet 15 did not edit an existing timestamped migration.
- Commands: iterative fixture diagnostics; complete two-cycle Phase 2 candidate replay; catalog/runtime/Storage pgTAP; all seeded Phase 2 workflows; legacy development seed compatibility; focused and complete Node suites; typecheck; lint; and production build.
- Results: both clean replay schemas match at `1a81561fbc291211a93329fc9ba194528d1152fcac2e139c9b977128fcd59744`; unseeded assertions pass 32/32; all four seeded files pass 90/90, including 41 proposal-to-liquidation assertions; static verification passes 188/188; typecheck, lint, legacy compatibility, and all 159 generated pages pass with zero failures/skips.
- Workflow/security impact: fixed planning-cube estimates preserve suppression; proposal and budget snapshots use explicit canonical JSON and reproducible hashes; trusted warnings are database-derived; Finance may clear/return but not edit; Director alone decides; the handoff is frozen and idempotent; allocation, explained variance, expenditure correction/void, strict liquidation, and non-overlapping claims are parent/version bound. Legacy mutation RPCs are revoked from callers.
- Rollback: set proposal and program-finance modes `off`, keep both mutation authorities `v1`, stop workers, preserve all versions/events/financial history, and expose compatibility reads only. Before deployment, revert only the Packet 15 checkpoint; never restore mutable reviewed revisions, caller-forged totals, cross-program documents, or automated decisions.
- External blocker: these are local technical results, not approved release evidence. Independent review, credential invalidation, baseline promotion, privacy/Auth/document-risk evidence, and final release authorization remain mandatory.
- Next exact action: checkpoint Packet 15 and complete Packet 16 role-specific interfaces, private document lifecycle, and atomic jobs.

## Packet 16 implementation record

- Files changed: role-aware Phase 2 workspace and Partner, historical, proposal, Finance, and document panels; allowlisted Partner catalog and program-finance queue APIs; document list/review APIs; atomic contact-email worker; redacted email adapter; Phase 2 replay scope; seeded pgTAP; focused source tests; and this ledger.
- Migration added: `20260818000890_phase2_interface_storage_job_completion.sql`. It is additive and forward-only; Packet 16 did not edit an existing timestamped migration.
- Commands: focused source tests; complete Node suite; typecheck; lint; production build; fixture diagnostics; and the complete two-cycle Phase 2 candidate replay with unseeded, seeded, and legacy compatibility checks.
- Results: both clean replay schemas match at `73f14863d57f1d73378d2cf20647a4be73480831637985123f3690586d72f6c8`; unseeded catalog/runtime/Storage assertions pass 32/32; five seeded workflow files pass 114/114; legacy development seed compatibility passes; static tests pass 193/193; typecheck and lint pass; and all 161 generated build pages pass with zero failures/skips.
- Interface impact: the Phase 2 workspace now derives role visibility from canonical capabilities and uses selector-driven, browser-operable Partner, mapping, historical, proposal, Finance, handoff, expenditure, liquidation, and document flows. Raw UUID prompts and JSON dumps are no longer the primary workflow.
- Storage/job security impact: documents remain generated-path, quarantined, parent-bound, and explicitly reviewed or risk-accepted; reads use audited short-lived URLs. The email worker claims and finalizes through checked atomic service RPCs with expiring leases and recovery events, while logs exclude addresses and provider response bodies.
- Rollback: set all Phase 2 components `off`, retain V1 mutation authority, stop outbox processing, and preserve documents, reviews, claims, and delivery events. Before deployment, revert only the Packet 16 checkpoint; never restore caller-selected paths, unchecked outbox updates, mutable review state, or raw operational UI output.
- External blocker: these results are local technical verification, not approved release evidence. Baseline promotion, independent credential invalidation, distinct review, privacy/Auth/document-risk approvals, and final release authorization remain mandatory.
- Next exact action: checkpoint Packet 16, then implement and execute Packet 17 raw JWT/RPC/Storage/concurrency, authenticated browser, AI interception, reconciliation, and rollback gates component by component.

## Packet 17 implementation record

- Files changed: Phase 2 mandatory scenario registry; raw Auth/PostgREST/RPC/Storage/concurrency runner; authenticated browser and loopback-AI runner; database-gate orchestration; Partner and historical barangay views; Finance partial-availability handling; capability parity; aggregate-only chatbot context; Phase 2 fixtures; replay scope; focused tests; package commands; inclusion manifest; and this informational ledger.
- Migration added: `20260818000900_phase2_executable_gate_corrections.sql`. It is a new forward-only migration after the current chain. It adds concurrency-safe Partner renewal, mode-bound idempotent reminders, target-bound explicit email requeue, corrected allowlisted historical reads, explicit capability parity, reviewed grants, and final off/V1 state. No existing timestamped migration was edited.
- Commands: focused executable-gate tests; complete Node suite; typecheck; lint; production build; Phase 2 behavior-only disposable run; authenticated Phase 2 browser/AI disposable run; complete two-cycle Phase 2 candidate replay with unseeded, seeded, behavioral, legacy-compatibility, and schema-hash checks; release inclusion/secret scan.
- Results: complete static tests pass 198/198 with zero failures/skips; typecheck and lint pass; all 161 generated build pages pass. The complete two-cycle database gate matches at `f7eb3280520a48be47fdf161fea934280e5799f9587ba907bbbd93918d6cb713`; unseeded assertions pass 32/32, seeded assertions 114/114, behavioral cases 83/83, and legacy-seed compatibility passes. Six authenticated browser scenarios pass, the AI recorder receives exactly three aggregate-only requests, no seeded canary appears, and proposal/program workflow fingerprints remain unchanged.
- Security/RLS impact: Captain and Secretary retain only own-barangay aggregate historical access; operational historical details remain staff-only. Renewal, reminders, and email requeue are runtime-, capability-, mode-, target-, version-, and idempotency-bound. Budget chatbot context exposes only allowlisted status counts, not descriptions, titles, contacts, documents, amounts, or row-level records. Expected denials leave no domain or audit side effects.
- Reconciliation/rollback: the executable gate reconciles the expected synthetic Partner/barangay graph, legacy proposal/program attribution, verified versus unverified history, budget/handoff counts, and reminder/outbox uniqueness. Rollback retains governed rows and events while all Phase 2 modes return to `off`, Partner/proposal mutation authorities return to `v1`, workers are no-op, and the untouched suppressed-email control remains suppressed.
- Inclusion/secret result: 16 implementation paths were classified for inclusion before this ledger/manifest refresh; zero ambiguous or unresolved secret findings were reported, with two previously approved synthetic test patterns acknowledged. No private bundle, dump, local credential, test recording, or executed evidence was added.
- External blocker: Packet 17 is local technical completion, not executed release evidence. Packet 18 still requires operator-verified old-credential invalidation, baseline promotion/archive, privacy and Auth evidence, official implementation/source inventories, document-risk/retention approval, a private artifact index, and final development-readiness authorization. Independent review is waived and must not be claimed.
- Next exact action: create the Packet 17 development checkpoint. Do not designate immutable candidate `R`, create executed evidence commit `E`, close either gate, enable production features, or begin Phase 3 until the external blockers are resolved and the authoritative suites are rerun against `R`.

## Solo-development review and account-preservation correction record

- Owner decision: independent reviewer separation is waived because this is a solo-development project. Evidence must truthfully state `Review-Mode: SOLO-DEVELOPER-SELF-REVIEW`, `Independent-Review-Performed: false`, and `Approval-Scope: DEVELOPMENT-READINESS-ONLY`. Production environments and production activation remain outside this evidence mode.
- Account decision: existing Auth and application identities remain intact for development testing. Mapping sign-off records a pending request and returns `accountPreserved: true` unless an explicit test-only suspension flag is enabled. Live accounts are never eligible through the automated finalizer.
- Migration added: `20260818000910_phase2_solo_development_account_preservation.sql`. The new forward migration requires synthetic runtime, a synthetic Partner, an active synthetic actor, an allowlisted synthetic legacy identity, and an allowlisted Partner before the service-only finalizer can update account state. It resets all Phase 2 runtimes to `off` and both cutover authorities to `v1` at completion.
- Evidence tooling: reviewer fields and distinct-person checks were replaced with the explicit solo-development fields across the parser, artifact registry, generated templates, runbook, and gate documentation. Solo evidence is rejected for `production` and still requires exact roles, immutable revision, private bundle hashes, zero failures/skips, and all artifact-specific controls.
- Verification: focused policy/account tests pass 32/32. Full static tests pass 199/199; lint, typecheck, and the 161-page build pass. The complete Phase 2 disposable gate passes two clean replays with matching schema hash `44b6a67d88d7d5997fa8a358c8f83e6550c0358ba209c7ed98da8867ea45e47a`, 32/32 unseeded assertions, 114/114 seeded assertions, 83/83 behavioral cases, and legacy-seed compatibility.
- Synthetic exception: the suspension finalizer is tested only with the reserved disposable legacy identity explicitly added to the synthetic allowlist. The ordinary application/browser environment keeps `AGAPE_LEGACY_ACCOUNT_SUSPENSION_ENABLED=false`.
- Remaining blocker: self-review removes only the reviewer dependency. Baseline promotion/archive is now complete; Packet 18 still requires operator-verified credential invalidation, Auth/privacy/configuration inputs, official history/account inventories, document-risk/retention decisions, the private artifact index, immutable `R`, and self-attested evidence commit `E`. Phase 3 and production activation remain blocked.

## Canonical baseline promotion and active-chain verification record

- Owner progress verified: the authoritative capture contract passed for `AGAPE-STAGING-20260825-PACKET7`; the capture records PostgreSQL 17 and an explicitly empty timestamped ledger.
- Baseline promotion: the exact private candidate was copied to `supabase/migrations/20260815000000_pre_phase0_baseline.sql`. Candidate and promoted SHA-256 both equal `e3d29ada8fa963f2af3dc7031a21575dd7d2d8a587d735b056c5d562ac1bce66`.
- Archive operation: all 53 unordered SQL files, including `_COMBINED_pending.sql`, were moved to `supabase/legacy-migrations/pre-phase0-unordered/`. No file was deleted. The checked-in archive manifest records every filename, SHA-256, known overlap/conflict disposition, and honestly retains `unknown` where execution history is not evidenced.
- Inventory result: strict migration inventory passes with 38 timestamped SQL files, zero unordered active files, zero missing captured-ledger versions, and zero findings.
- Phase 1 active-chain result: two clean replays match at `d45c46a578f3cb65c8815bfd4e4de63749a7ade82c8e4f528f6de356d9ec0c4d`; catalog assertions pass 12/12, fixture assertions 22/22, behavioral gates 99/99, and legacy-seed compatibility passes.
- Phase 2 active-chain result: two clean replays match at `44b6a67d88d7d5997fa8a358c8f83e6550c0358ba209c7ed98da8867ea45e47a`; catalog/runtime/Storage assertions pass 32/32, seeded workflows 114/114, behavioral gates 83/83, and legacy-seed compatibility passes.
- Repository verification: evidence templates now identify PostgreSQL 17; all 29 templates regenerate deterministically; static tests pass 199/199; typecheck, lint, and the 161-page production build pass.
- Security boundary: no migration or ledger operation was sent to staging/shared/production. Profiling and all Phase 2 modes remain `off`, both mutation authorities remain `v1`, all application flags remain false, and existing development accounts remain preserved.
- Rollback: before deployment, revert the scoped canonical-promotion checkpoint to return the archived files to their prior tracked locations. Never remove the private authoritative capture or weaken security migrations. A future connected ledger proposal remains tracking-only, explicitly authorized, and separately evidenced.
- Next exact action: regenerate the inclusion manifest and filename/count-only secret scan, stage only the canonical baseline, archive, manifest, version correction, test, and ledger updates, then create a normal development checkpoint. Do not designate release candidate `R` yet.

## Disposable Auth recovery and invitation completion record

- Status: `locally_complete`. This is a normal development packet and does not
  designate release candidate `R`, create executed evidence, or activate a
  shared environment.
- Files changed: local Mailpit test support, authenticated Phase 1 browser
  workflows, recovery and invitation pages, a protected server sign-out route,
  middleware, disposable Auth redirect configuration, replay scopes, database
  catalog assertions, source contracts, and this informational ledger.
- Migration added: `20260818000920_phase1_invitation_completion_boundary.sql`.
  It is additive and forward-only. The fixed-search-path SECURITY DEFINER
  function returns only a boolean proving that the current authenticated Auth
  invite matches its own pending inactive approved-role account. It does not
  expose `public.users`, weaken active-account/capability RLS, or grant anon or
  PUBLIC execution.
- Auth behavior: the local recovery flow consumes the real one-time Mailpit
  link, updates the password, clears the SSR session through an independently
  authenticated no-body sign-out endpoint, returns to login, and authenticates
  with the new password. The invitation flow consumes only an invite-type
  implicit session, activates only the matching pending profile through the
  audited service endpoint, and reaches the returned role home.
- Commands: focused Auth/scope/source tests; full Node tests; typecheck; lint;
  production build; complete Phase 1 two-replay database gate; and two complete
  authenticated Phase 1 browser reruns after final hardening.
- Results: 204/204 static tests pass; typecheck and lint pass; all 163 generated
  build pages/routes pass; two clean Phase 1 replays match at
  `13b7c02c3a61790f5699fec26ad9a00a38a788bf367a2b9020212643b25345ab`;
  catalog tests pass 15/15; seeded fixture tests pass 22/22; behavioral gates
  pass 99/99; legacy-seed compatibility passes; and authenticated browser gates
  pass 10/10 with zero mandatory skips.
- Isolation/final state: all Auth links and endpoints were loopback-only, all
  recipients used `.invalid`, Mailpit was cleared before each suite, the
  disposable stack was removed, profiling returned to `off`, feature flags
  remained false outside the verified child process, no remote account or data
  was mutated, and no real personal data was used.
- Rollback: before deployment, revert this development checkpoint to remove the
  new route/function/tests and restore the prior page behavior. Never weaken
  active-account RLS, expose pending user rows, restore client-only SSR signout,
  or accept non-local Auth links in the executable gate.
- Next exact action: create the reviewed development checkpoint, then rerun the
  complete Phase 2 replay and authenticated browser/AI regression against the
  full chain. Packet 18 remains externally blocked after local regressions pass.

## Full-chain regression after disposable Auth completion

- Status: `locally_complete`. The regression was executed from clean
  development checkpoint `742c00ea1b2d4db38ac4eaedabaf95121d0e5cd4` and
  remains diagnostic rather than approved release evidence.
- Phase 2 database result: two fresh full-chain replays match at
  `d5cf126fcfaabd5012cb0e5a0ddf9b73612183c01d1c556d02a268aa181dacbf`;
  catalog/runtime/Storage assertions pass 32/32; seeded workflows pass 114/114;
  direct Auth/PostgREST/RPC/Storage/concurrency cases pass 83/83; and legacy
  development seed compatibility passes.
- Phase 2 browser/privacy result: the fresh authenticated stack passes all
  114 fixture assertions and 6/6 browser cases. The loopback AI recorder accepts
  only the existing aggregate DTO requests, rejects every configured resident,
  contact, document, narrative, budget-description, receipt, and financial
  canary, and observes no proposal/program workflow mutation.
- Isolation/final state: the test runners accepted only loopback endpoints,
  removed each known disposable stack, returned every Phase 2 runtime to `off`,
  restored both mutation authorities to `v1`, left all ordinary flags false,
  preserved existing development accounts, and made no shared/remote change.
- Migration impact: no additional migration was created during this regression.
  The full chain includes the forward-only invitation boundary added in the
  preceding checkpoint.
- Rollback: no governed state exists outside destroyed disposable stacks. Keep
  the operational rollback boundary at flags/modes `off`, V1 authority, and
  workers stopped/no-op; do not use down migrations.
- Remaining hard blocker: all locally executable implementation and diagnostic
  gates are complete. Packet 18 cannot honestly freeze `R` or create approved
  evidence without the owner-supplied external governance/configuration inputs,
  private artifact index, and development-readiness attestations listed in the
  release-gate status documents.

## Phase 3 advisory planning foundation (owner-authorized local development)

- Status: `locally_complete`. The repository owner directed development to
  proceed using recommended defaults. This entry records working local
  development only; it does not close the Phase 1/2 governance gates or
  authorize a shared/production deployment.
- Starting checkpoint: `797559eab6aec7db0839321712e37e848108e0e5` on
  `release/phase1-phase2-gate-closure`.
- Implemented: a deterministic approved-need recommendation engine, strict
  `agape.ai.need-recommendations.v2` response contract, capability-gated and
  audited read API, Analytics recommendation screen, and human-controlled
  prefill into the existing proposal builder. The engine uses controlled need
  categories, priority, and explicit proposal/program links. It does not call
  an external AI provider and never creates, submits, advances, clears,
  approves, returns, or rejects a proposal.
- Proposal assistance: the proposal form now provides a local advisory
  alignment check with ten transparent checks. Results are informational and
  require the user to edit and save the proposal normally. The SDG selector now
  displays the complete 1-17 catalog.
- Compatibility correction: added forward migration
  `20260818000930_phase2_proposal_compatibility_correction.sql`. It supplies the
  missing non-negative `expected_beneficiary_count` column already referenced
  by existing proposal functions and expands both legacy SDG constraints to
  1-17. Existing timestamped migrations were not edited.
- Existing defect corrected: V1 proposal list/detail routes now select the
  canonical fields used by the interface through explicit allowlists; obsolete
  column names and broad row selections were removed.
- Workflow completion: the recommendation screen supports category, priority,
  coverage, and barangay filters; planned needs link to pipeline review instead
  of encouraging a duplicate draft; the Officer dashboard surfaces advisory
  counts without blocking its normal data if the optional advisory endpoint is
  unavailable; and the proposal form captures and displays a non-negative
  expected beneficiary count with aggregate/manual-source guidance.
- Security/privacy: recommendations require both `analytics.aggregate.read`
  and `ai.assist`, respect deny-only overrides in both API and navigation, omit
  need narratives and resident/contact/document/financial descriptions, use
  no service-role `select("*")`, and append a minimal read audit. The output is
  advisory-only and contains no resident drill-through.
- Verification: focused advisory tests pass 9/9; the complete static suite
  passes 213/213; typecheck and lint pass; the 165-page production build passes;
  migration inventory reports 40 ordered migrations and no findings; Docker
  preflight passes; and the complete Phase 2 disposable gate passes two clean
  replays with matching schema hash
  `bd2b0605515ae10a3d06bbe5880425ba4ed93435587e0311657cb58b7ccbadd9`,
  catalog/runtime/Storage assertions 32/32, synthetic workflow assertions
  114/114, behavioral cases 83/83, and legacy-seed compatibility.
- Database impact: all SQL verification ran against destroyed loopback-only
  disposable stacks. No shared database, migration ledger, Auth account, or
  application row was changed.
- Rollback: revert the eventual development checkpoint to remove the advisory
  page/API/engine, proposal prefill/alignment UI, explicit proposal read fixes,
  and forward compatibility migration. Do not use a down migration after the
  compatibility correction has been applied; use a forward correction and
  keep workflow decisions human-controlled.
- Checkpoints: `b2a0640` contains the initial advisory foundation. The next
  normal development checkpoint will contain the filtering, dashboard, and
  expected-beneficiary-count workflow completion described above.
- Next exact action: inspect the existing evidence-bound beneficiary estimator
  and structured proposal interface, then integrate only demonstrated missing
  planning behavior without enabling external AI or production features.

## Phase 3 evidence-bound beneficiary planning (owner-authorized local development)

- Status: `locally_complete`. This is a dark local implementation checkpoint,
  not release evidence and not production activation.
- Implemented: the structured proposal wizard now lists only compatible,
  completed `agape.profiling.aggregate.v2` evidence metadata for its selected
  synthetic/live barangay, invokes the existing fixed planning-cube estimator,
  displays source/as-of/sample/coverage provenance, pre-fills a usable aggregate
  count, and records a reason when a human overrides that count.
- Privacy behavior: aggregate cells are never returned by the evidence-options
  RPC. A suppressed cell returns only its suppression marker, has no
  drill-through, cannot be committed as a planning-cube estimate, and directs
  the user to a separately documented manual source instead.
- Migration: added forward-only
  `20260818000940_phase2_beneficiary_evidence_options.sql`, with fixed search
  path, actor/runtime/capability/data-mode checks, an explicit metadata DTO,
  audit logging, `PUBLIC`/`anon` revocation, and reviewed `authenticated`
  execution. Existing timestamped migrations were not edited.
- Interface behavior: changing barangay, sitio, category, or evidence clears a
  stale calculation; manual estimates require a source; aggregate overrides
  require a reason; at least one SDG and a positive whole-number final count are
  checked before the atomic proposal graph is sent.
- Verification: focused contract tests pass 24/24; the complete Node suite
  passes 214/214; typecheck and lint pass; the 165-page production build passes;
  migration inventory reports 41 ordered migrations and no findings. The full
  disposable Phase 2 gate passes two clean replays with matching schema hash
  `43736504d7a3964f3819536316c91b313fd6c1adba17a9a758d30bf47ab296b7`,
  catalog/runtime/Storage assertions 32/32, seeded workflow assertions 116/116,
  behavioral cases 83/83, and legacy-seed compatibility. The authenticated
  Phase 2 browser gate passes 6/6 scenarios.
- Final state: all disposable stacks were removed; Phase 2 modes are `off` and
  V1 mutation authority remains the default. No shared database, Auth account,
  or real personal/financial row was changed.
- Rollback: revert this development checkpoint before deployment. If the new
  migration has ever been applied, replace defects with a later forward
  migration; do not expose aggregate cells or restore arbitrary resident
  filtering.
- Next exact action: audit the combined recommendation, alignment, beneficiary,
  and unmet-need behavior against the Phase 3 advisory boundary, then implement
  only a demonstrated remaining local gap.

## Phase 3 coverage and evidence correction (owner-authorized local development)

- Status: `locally_complete`. This remains read-only advisory development and
  does not authorize production activation or automated proposal decisions.
- Coverage correction: active programs no longer hide an approved need merely
  because a link exists. A `full` active need link suppresses duplicate work;
  a `partial` active link produces a remaining-gap review with a direct link to
  the human-operated program workspace. Legacy links without structured
  coverage are treated conservatively as partial.
- Evidence correction: the recommendation route selects the newest valid
  completed/archived profiling evidence per barangay and validates the entire
  snapshot through the strict `ProfilingAggregateDTO` contract. Each
  recommendation receives only cycle/date, sample size, coverage/response,
  data-quality metadata, and the matching `needs` category count or suppression
  marker. Raw cells, resident rows, household versions, and drill-through are
  not returned.
- Contract: `agape.ai.need-recommendations.v2` distinguishes unaddressed,
  planned, and partial-active states; reports full versus partial active program
  counts; and remains strict, deterministic, audited, and advisory-only.
- Verification: focused advisory tests pass 11/11; the complete Node suite
  passes 216/216; typecheck and lint pass; and the 165-page production build
  passes. No SQL migration or shared/remote operation was performed for this
  checkpoint.
- Rollback: revert this development checkpoint. Do not restore the former
  behavior that treated any active link as complete coverage or bypass strict
  aggregate validation.
- Next exact action: assess the remaining documented Phase 3 gaps—ranked
  alternatives, indicative resources, verified-history benchmarks, and human
  recommendation review state—and implement the smallest complete vertical
  slice without external AI or automated workflow transitions.

## Phase 3 ranked alternatives and resource guidance (owner-authorized local development)

- Status: `locally_complete`. No feature flag, runtime mode, database row, or
  proposal workflow state was changed.
- Implemented: every controlled community-need category now produces three
  deterministic ranked alternatives. The first remains the editable proposal
  prefill suggestion; the other two are visible comparison options and never
  create drafts automatically.
- Resource guidance: every recommendation lists bounded indicative
  coordination, people, material, venue, or technical-support needs with a
  quantity basis and an explicit limitation. The guidance does not invent
  prices, promise outcomes, assign volunteers, or bypass technical and human
  validation.
- Verification: focused advisory tests pass 11/11; all 216 Node tests pass;
  typecheck and lint pass; and the 165-page production build passes.
- Rollback: revert this development checkpoint to return to a single primary
  intervention. Keep proposal saving/submission and every workflow transition
  human-controlled.
- Next exact action: add quality-aware, category-matched verified-history
  benchmarks for indicative budget and volunteer ranges, returning an explicit
  unavailable state rather than fabricating an estimate when evidence is too
  sparse.

## Phase 3 verified-history planning benchmarks (owner-authorized local development)

- Status: `locally_complete`. This is an advisory read path only; it neither
  edits history nor creates or transitions a proposal.
- Implemented: when the Historical Programs server gate is enabled and its
  database runtime is `synthetic` or `live`, the recommendation route reads only
  category, budget total, volunteer count, quality, status, date, and data mode
  from accepted/archived `complete` or `partial_verified` records in the latest
  five-year window. Narratives, sources, contacts, documents, and unverified
  rows are excluded.
- Estimation: at least two usable observations are required independently for
  a PHP budget range or volunteer range. Results show observed minimum/maximum,
  matched-record count, window, confidence, and limitations. Missing or sparse
  evidence returns `unavailable`/`limited` with null ranges rather than an
  invented number.
- Verification: focused advisory tests pass 12/12; all 217 Node tests pass;
  typecheck and lint pass; and the 165-page production build passes. No SQL,
  shared database, Auth, or production configuration change occurred.
- Rollback: revert this checkpoint to remove benchmark calculation and display.
  Do not substitute unverified history or free-text narratives as AI context.
- Next exact action: implement durable human recommendation review state with
  Researcher/Director endorsement and reason-required dismissal, versioned
  fingerprints, and derived staleness—without letting those actions create or
  advance proposals.

## Migration, security, and rollback notes

- No migration was applied to a shared or remote database. Four timestamped migrations proven absent from the sole authoritative ledger were corrected locally after executable replay exposed deterministic defects.
- The staging database and Storage API were contacted only for authorized read-only schema/catalog capture. No DDL, ledger change, Auth mutation, Storage mutation, or application-row write occurred.
- No secret value was printed or copied into Git or command output; the rotated secret remained confined to ignored local configuration and process memory.
- The four reported secret-rule matches are deliberate invalid JWT/PostgreSQL fixtures in security tests and were acknowledged by the repository owner.
- Rollback before the checkpoint consists of removing only the newly added manifest/status tooling; user work remains untouched.

## Phase 3 durable recommendation review (owner-authorized local development)

- Status: `locally_complete`. This is a dark local development slice only; it
  does not close a release gate, apply a migration to a shared database, or
  authorize production activation.
- Implemented: deterministic material-state SHA-256 fingerprints on advisory
  recommendations; derived `open`, `endorsed`, `dismissed`, and `stale` review
  states; Researcher/Director endorsement; and controlled, reason-required
  dismissal. Review events use a database-issued event sequence, are
  append-only, and retain actor and timestamp. Identical retries are
  idempotent.
- Authorization: added `ai.recommendation.review` to the canonical TypeScript
  and SQL capability matrices for the Director and Researcher only. The
  existing `ai_assistance` deny override can only remove it. Admin, Associate,
  Finance, barangay roles, Volunteers, and legacy roles cannot record a final
  recommendation review.
- Database boundary: added forward-only migration
  `20260818000950_phase3_recommendation_review_state.sql`, restrictive forced
  RLS, no direct authenticated table mutation, revoked `PUBLIC`/`anon`
  execution, a fixed-search-path RPC, controlled reasons, approved/open-need
  validation, transactional audit insertion, and immutable history. No
  existing timestamped migration was edited.
- Interface: the Analytics recommendation cards show current/stale human review
  state and expose review controls only when the response confirms review
  authority. The controls explicitly state that review does not create or
  advance a proposal.
- Verification: focused contracts pass 34/34; the complete Node suite passes
  220/220; typecheck and lint pass; and the 166-page/route production build
  passes. The complete disposable Phase 2 database gate passes two clean
  replays with matching SHA-256
  `f79ff0767b9e9c8ac788b62a1f2c85fec55d964d94849bd225f6b0b6f6d10998`,
  catalog/runtime/Storage assertions 32/32, seeded workflow assertions 135/135,
  behavioral cases 83/83, and legacy-seed compatibility. Authenticated browser
  and AI privacy gates pass 7/7, including a real Researcher dismiss/endorse
  flow whose proposal/program workflow fingerprint remains unchanged.
- Defects found by executable testing: a null SQL dismissal reason initially
  passed because of SQL three-valued `NOT IN` semantics; it now fails
  explicitly. Timestamp-only event ordering was ambiguous inside one
  transaction; a database identity sequence now defines the latest review.
  PostgreSQL offset timestamps are accepted by the strict response schema.
- Final state: disposable stacks were removed, Phase 2 modes returned to
  `off`, V1 mutation authority remains the default, and no remote/shared
  database or real personal/financial record was changed.
- Rollback: revert this development checkpoint before deployment. If the new
  migration is ever applied, correct defects through a later forward migration
  and retain all review/audit history; do not use a destructive down migration.
- Next exact action: implement a bounded scheduled advisory-refresh and
  notification path that remains disabled by default, creates recommendation
  notices only, honors current/stale fingerprints, and cannot create or
  transition proposals.

## Combined evidence-verifier and gate-status correction record

- Status: `locally_complete`. This is a normal development packet and does not
  designate release candidate `R` or create executed evidence commit `E`.
- Files changed: shared evidence-path registry, release-gate configuration,
  Phase 1/2 verifier entry points, release runner, focused verifier tests, and
  the two release-gate status documents.
- Verifier correction: Phase 1 continues to require and validate only its exact
  15 evidence artifacts and private bundles, while the revision-context check
  permits the same evidence-only commit `E` to contain the 14 registered Phase 2
  artifacts. Phase 2 still validates all 29 artifacts. Unregistered evidence,
  executable changes, dirty trees, abbreviated revisions, and non-descendant
  release revisions remain fail-closed.
- External progress recorded without overclaiming: local clients use modern
  publishable/secret keys; legacy JWT API keys are disabled; modern-key Admin,
  statistics, and notification requests passed; recovery callback and reset-page
  routing passed. Final password submission and invitation E2E remain pending
  and are not represented as approved evidence.
- Commands: focused release-evidence test, complete Node suite, typecheck, lint,
  and production build.
- Results: focused verifier tests pass 10/10; complete Node tests pass 202/202
  with zero failures/skips; typecheck and lint pass with no errors/warnings; all
  161 production pages/routes build successfully.
- Migration/security impact: no SQL migration, shared DDL, ledger operation,
  Auth-account mutation, or feature activation occurred. Exact evidence-path
  allowlists remain the only permitted `R..E` changes.
- Rollback: revert this development checkpoint to restore the former verifier
  configuration and status wording. Do not remove the canonical baseline,
  archive, private capture, modern key configuration, or security migrations.
- Remaining blocker: privacy inputs, final Auth cases, official history/account
  inventories, document risk/retention decision, immutable `R`, authoritative
  reruns, private bundles/index, and self-attested evidence `E` are still
  required. Production and Phase 3 remain unauthorized.
- Next exact action: run release inclusion and filename/count-only secret checks,
  create a normal development checkpoint if clean, then continue any remaining
  locally executable release-preparation work. Stop only when an external input
  is indispensable.

## Admin provisioning isolation correction record

- Status: `locally_complete`. The correction responds to the authenticated
  development observation that `/admin/users` called `/api/partnerships` and
  received the intended Admin-isolation `403`.
- Files changed: Admin user-management page, a new narrow
  `/api/admin/user-provisioning-options` selector route, focused authorization
  tests, and this informational ledger. No migration was added.
- Authorization correction: the selector independently requires
  `admin.users.manage`, uses the service client only after authentication, reads
  active barangays through the explicit `id,name` allowlist, and returns no
  partnership contacts, population, agreement, or operational fields. The
  existing partnership API remains inaccessible to Admin.
- Interface correction: Admin no longer calls the operational partnership API;
  dead Office, Student Organization, and Department account-creation controls
  were removed; barangay assignment is shown only for barangay roles; changing
  to a non-barangay role clears the stored assignment; and Finance is present in
  the approved role filter.
- Commands: focused Auth contract tests, complete Node suite, typecheck, lint,
  production build, and a read-only local browser attempt.
- Results: focused Auth tests pass 6/6; complete Node tests pass 203/203 with
  zero failures/skips; typecheck and lint pass; all 162 pages/routes build. The
  in-app browser correctly redirected an unauthenticated request to login. The
  user's authenticated Chrome session was not connected to the browser-control
  extension, so no authenticated browser result is claimed here; final E2E
  remains mandatory against `R`.
- Security/RLS impact: Admin isolation is preserved and the noisy forbidden
  operational request is eliminated. No direct table mutation, broad DTO, or
  new partnership capability was introduced.
- Rollback: revert this checkpoint to restore the prior UI call and remove the
  selector route. Do not weaken the partnership API's `partnership.read`
  capability or grant Admin operational access.
- Next exact action: regenerate the inclusion/secret manifest, checkpoint this
  correction, then audit the remaining release preparation for work that can be
  completed without external privacy, historical, account, risk, or evidence
  inputs.

## Admin provisioning authenticated browser-gate record

- Status: `locally_complete`. This extends the disposable authenticated Phase 1
  gate; it is not release evidence and does not designate candidate `R`.
- Files changed: the Phase 1 authenticated Playwright workflow, its browser-gate
  contract, the expected browser case count, and this informational ledger. No
  migration was added.
- Scenario added: a reserved synthetic System Admin signs in, loads
  `/admin/users`, receives `200` from the narrow
  `/api/admin/user-provisioning-options` endpoint, opens the account-creation
  dialog, selects a barangay login role, receives only the two synthetic
  barangay choices, and makes no request to `/api/partnerships`.
- Commands: focused Phase 1 browser contract tests, typecheck, the complete
  disposable authenticated Phase 1 browser gate, complete Node tests, lint,
  typecheck, and production build.
- Results: focused browser contracts pass 2/2; fixture assertions pass 22/22;
  authenticated browser scenarios pass 8/8; complete Node tests pass 203/203;
  typecheck and lint pass; and all 162 production pages/routes build. The first
  browser attempt exposed only an incorrect test assumption that the card title
  had heading semantics; the corrected exact-text locator then passed the full
  disposable rerun.
- Security impact: Admin remains isolated from operational Partnership
  capability and data. The selector response is exercised through the real
  authenticated route in a loopback-only synthetic stack; expected access does
  not rely on direct API fixture shortcuts.
- Final state: the disposable stack was removed, profiling returned to `off`,
  no remote database or Auth account was mutated, and no real personal or
  financial data was used.
- Rollback: revert only this browser-test checkpoint. Do not restore the Admin
  page's operational partnership request or broaden the selector DTO.
- Next exact action: run inclusion and filename/count-only secret checks, create
  a normal development checkpoint, then automate the remaining Auth recovery
  and invitation cases against disposable local Supabase so the remote email
  rate limit is not a development blocker.

## Phase 3 explainable proposal-alignment dimensions

- Status: `locally_complete`. This is local advisory development only; it does
  not activate an AI provider, alter a proposal, or authorize Phase 3 release.
- Implemented: replaced the user-facing ten-item percentage score with eight
  explicit dimensions covering community need, beneficiary appropriateness,
  implementation feasibility, SDGs, budget/resources, institutional alignment,
  previous-program evidence, and policy scope. Each dimension reports Strong,
  Moderate, Weak, or Insufficient Evidence with evidence, a textual finding,
  and a recommended next action.
- Safety behavior: the strict `agape.ai.proposal-alignment.v2` contract contains
  no numeric score. Missing approved evidence is reported as a limitation rather
  than inferred from proposal prose. Not Recommended remains advisory and never
  saves, rejects, submits, or advances the proposal.
- Interface: the existing proposal editor passes its beneficiary count and
  prior-initiative lineage into the deterministic check, presents each
  dimension visibly, and continues to require the user to rerun the check after
  edits.
- Commands/results: focused advisory contracts pass 16/16; complete Node tests
  pass 221/221 with zero failures/skips; typecheck and lint pass; and the
  166-page/route production build passes.
- Migration/security impact: no SQL migration, service-role read, external AI
  request, shared database operation, or feature-state change occurred.
- Rollback: revert this development checkpoint to restore the former local
  completeness score. Do not couple alignment output to automated proposal
  workflow decisions.
- Next exact action: implement a bounded, disabled-by-default scheduled
  recommendation refresh and in-app notification path that honors current and
  stale fingerprints and cannot create or transition proposals.

## Phase 3 scheduled advisory refresh and in-app notices

- Status: `locally_complete`. The job remains explicitly disabled and off in
  committed configuration; no remote schedule or shared database was changed.
- Implemented: a Monday refresh reuses the strict recommendation engine and
  creates only in-app alerts. It is protected by the cron secret, a separate
  boolean feature gate, and an `off | synthetic | live` process mode. Invalid
  or missing modes fail closed.
- Recipient behavior: eligible Researcher and Associate accounts receive a new
  material recommendation; Directors receive Critical or currently endorsed
  recommendations. Inactive accounts, AI-denied accounts, and opposite-mode
  accounts are excluded. A current dismissal suppresses delivery, while a new
  fingerprint makes the former decision stale and eligible for review again.
- Database boundary: added forward-only migration
  `20260818000960_phase3_recommendation_notifications.sql`. The service-only,
  fixed-search-path RPC validates an exact three-field aggregate payload,
  validates actual need priority and synthetic/live barangay mode, inserts the
  notice and immutable delivery record atomically, and deduplicates by need,
  fingerprint, and recipient under an advisory lock. It cannot create or alter
  proposals.
- Notification compatibility: added the already-consumed `action_url` column
  forward-only. The authenticated notification API now returns an explicit
  eight-field DTO and uses a strict, bounded mark-read contract instead of
  `select("*")` and an unchecked body.
- Verification: focused contracts pass 22/22; complete Node tests pass 222/222;
  typecheck and lint pass. Two clean Phase 2 database replays match at SHA-256
  `e9dae37b31d8d8f80f4ce007f6c58502c3778538cf810b1cf3dd9e2c271e61a1`;
  catalog/runtime/Storage assertions pass 32/32, seeded SQL passes 154/154,
  behavioral security passes 83/83, legacy-seed compatibility passes, and the
  authenticated browser/AI gate passes 8/8. The browser gate proves a material
  first delivery, zero-delivery idempotent retry, visible allowlisted notice,
  and unchanged proposal/program workflow fingerprint.
- Final state: disposable stacks were removed. The automation flag remains
  `false`, its mode remains `off`, Phase 2 modes remain `off`, and V1 mutation
  authority remains the default.
- Rollback: disable the flag and set the process mode to `off`. If the migration
  has been applied, retain immutable delivery history and correct defects with
  a later forward migration rather than deleting notification evidence.
- Next exact action: audit the remaining approved Phase 3 advisory scope for a
  demonstrated local gap, prioritizing user-visible unmet-need coverage and
  review transparency over external AI or workflow automation.

## Phase 3 conservative unmet-need coverage estimate

- Status: `locally_complete`. This remains a de-identified advisory read path;
  it does not activate Phase 3, change a proposal, or apply DDL to a shared
  database.
- Implemented: recommendation coverage now reports an explicit `available`,
  `suppressed`, or `unavailable` estimate. An available estimate displays the
  approved aggregate affected count, the largest positive beneficiary count
  from an eligible linked proposal or active program, the resulting bounded
  percentage, confidence, and a plain-language limitation.
- Conservative rule: linked plans are never summed because their beneficiary
  groups may overlap. The largest linked plan is used as a planning comparison,
  and the interface states that it is sample-based and requires human
  validation. Suppressed cells produce no percentage or drill-through; missing
  counts remain unavailable instead of being inferred.
- Trust boundary: the API selects only explicit proposal/program linkage and
  planned-count fields, reuses the strict approved profiling aggregate, and
  returns the strict `agape.ai.need-recommendations.v2` DTO. The material
  coverage estimate is included in the existing recommendation fingerprint, so
  a changed estimate makes an earlier review stale.
- Commands/results: focused advisory contracts pass 19/19; the complete Node
  suite passes 224/224; typecheck and lint pass; the 166-page/route production
  build passes; the disposable Phase 2 seeded suite passes 154/154; and the
  authenticated browser/AI privacy gate passes 8/8 with the coverage panel
  exercised through the real local route.
- Final state: the disposable stack was removed, recommendation automation is
  still disabled/off, Phase 2 modes are off, and V1 mutation authority remains
  the default. No remote database or real personal/financial record changed.
- Rollback: revert this development checkpoint. Do not replace suppressed or
  unavailable states with zero, sum potentially overlapping linked plans, or
  add resident drill-through.
- Next exact action: audit the remaining approved advisory workflow for the
  smallest locally executable gap, with preference for transparent proposal
  prefill provenance or recommendation-to-draft handoff that remains an
  explicit human save action.

## Phase 3 beneficiary guidance and explicit draft handoff

- Status: `locally_complete`. No proposal is created, saved, submitted, or
  advanced by the recommendation engine.
- Implemented: each recommendation now includes a strict controlled beneficiary
  segment, a suppression-safe suggested starting count when approved aggregate
  evidence supports one, its as-of date, confidence, source classification, and
  limitation. Missing or suppressed evidence produces no invented count.
- Draft handoff: choosing `Prepare a proposal draft` opens the existing proposal
  form with an editable title, barangay, SDGs, beneficiary segment, and safe
  count. A visible provenance panel identifies the recommendation and evidence,
  explains the sample limitation, and states that no proposal exists until the
  officer explicitly chooses Save Draft.
- Duplicate guard: a caller-crafted `from_need` URL cannot prefill a duplicate
  proposal when the current recommendation action is to review an existing plan
  or active coverage. Only `develop_response` recommendations may enter the
  draft-starter path.
- Review staleness: the beneficiary guidance is part of recommendation
  fingerprint rule version 2, so material guidance changes invalidate an older
  human review rather than silently retaining it.
- Commands/results: focused advisory contracts pass 19/19; the complete Node
  suite passes 224/224; typecheck and lint pass; and the 166-page/route
  production build passes. No SQL migration or remote/shared operation was
  performed.
- Rollback: revert this development checkpoint. Do not replace the explicit Save
  Draft action with automatic creation or allow a recommendation to submit or
  advance workflow.
- Next exact action: inspect the recommendation recency rule and implement the
  approved 24-month prior-program relevance window so completed programs inform
  recommendations without permanently masking recurring needs.

## Phase 3 24-month completed-program relevance

- Status: `locally_complete`. Completed programs remain advisory context and do
  not automatically hide, resolve, or reject a current approved need.
- Implemented: the recommendation route now reads only program status and end
  date for linked operational programs, derives a rolling 24-month window, and
  separates recent completed programs from older or undated records. Future end
  dates do not count as recent evidence.
- Interface: recommendation summaries and cards distinguish recent completion
  context from older/undated history. The rationale directs staff to review
  verified outcomes and recurrence for recent programs, while explicitly
  labelling older or undated records as limited context.
- Integrity: strict input validation prevents recent completed counts from
  exceeding total completed history. Both values participate in the material
  recommendation state and therefore in review staleness.
- Commands/results: focused advisory contracts pass 20/20; the complete Node
  suite passes 225/225; typecheck and lint pass; and the 166-page/route
  production build passes. No migration or remote/shared operation occurred.
- Rollback: revert this development checkpoint. Do not restore an unbounded
  historical count that treats old or undated programs as equally current.
- Next exact action: make the recommendation priority queue conform to the
  approved automation rule—automated alerts target High/Critical gaps, while
  lower-priority needs remain available for manual analysis without routine
  notification noise.

## Phase 3 high-priority alert eligibility

- Status: `locally_complete`. The recommendation page still shows every
  approved open need that passes the advisory rules, but the weekly worker now
  sends only the narrower approved alert candidate set.
- Implemented: each recommendation carries a strict automation decision and
  reason. High/Critical unaddressed, unverified planned, insufficient planned,
  and partial-active gaps are eligible. Lower-priority recommendations remain
  manual-analysis-only. A planned response at or above the initial 80% planning
  threshold is shown but excluded from routine alerts.
- Safety: active partial coverage remains alert-eligible even when a raw count
  appears high, because the governed link still declares a remaining gap. The
  weekly route filters before calling the service-only notification RPC and
  continues to create notices only—never proposals or workflow transitions.
- Interface: the Analytics summary shows the candidate count, and each card
  explains whether it is a weekly alert candidate or manual analysis only. The
  80% threshold is visible as an initial planning threshold, not a final human
  decision.
- Commands/results: focused advisory contracts pass 21/21; the complete Node
  suite passes 226/226; typecheck and lint pass; the 166-page/route build
  passes; the disposable seeded database suite passes 154/154; and the
  authenticated browser/AI privacy gate passes 8/8. No shared or remote change
  occurred, and the disposable stack was removed.
- Rollback: revert this development checkpoint. Do not restore all-priority
  automated notices or allow the alert label to mutate a need or proposal.
- Next exact action: add Director-managed recommendation threshold
  configuration behind an authenticated, versioned setting boundary, keeping
  80% as the fail-safe default and never permitting configuration to activate
  automation.

## Phase 3 Director-managed recommendation threshold

- Status: `locally_complete`. The setting changes advisory classification only;
  the scheduled worker remains separately disabled/off and no proposal or need
  workflow can be changed through this boundary.
- Implemented: added canonical capability `ai.recommendation.configure`, granted
  only to the PARAYA Director and still subject to the deny-only
  `ai_assistance` override. A strict versioned settings DTO and authenticated
  PUT endpoint call one fixed-search-path database RPC.
- Database boundary: forward-only migration
  `20260818000970_phase3_recommendation_settings.sql` adds a singleton threshold
  setting with the safe 80% default, 1-100 validation, expected-version locking,
  Director/capability checks, restrictive RLS, explicit execution grants, and a
  durable audit event. `PUBLIC` and `anon` cannot execute the RPC.
- Runtime behavior: recommendation reads use the configured threshold when the
  optional setting exists and fail safely to 80% when it has not been deployed.
  The response states the setting source and row version. The Director UI can
  update it, while Researcher and Associate views remain read/review scoped.
- Browser proof: the authenticated Director workflow loads 80%, saves 85%,
  observes the success state, reloads, and reads 85% from the actual API. The
  page explicitly states that this does not enable the weekly worker or create,
  submit, approve, or reject a proposal.
- Commands/results: focused contracts pass 42/42; complete Node tests pass
  227/227; typecheck and lint pass; and the 167-page/route production build
  passes. Two clean Phase 2 database replays match at SHA-256
  `e1bf780a64c09ce1852463198de3765062a8dc80fc2771acecdf6a40698be74c`;
  catalog/runtime/Storage assertions pass 32/32, seeded SQL passes 168/168,
  behavioral security passes 83/83, legacy-seed compatibility passes, and the
  authenticated browser/AI privacy gate passes 9/9.
- Final state: disposable stacks were removed; all committed Phase 1/2 feature
  flags remain false, database component modes remain off, recommendation
  automation remains off, and V1 mutation authority remains the default. No
  shared or remote database was changed.
- Rollback: set the recommendation worker mode to `off` and keep its feature
  flag false. If the migration has been applied, retain the version and audit
  history and correct defects with a later forward migration.
- Next exact action: continue the user-visible advisory workflow by adding a
  bounded planning-alignment assessment to the draft handoff, preserving human
  editing and prohibiting automatic proposal transitions.

## Phase 3 server-audited proposal alignment

- Status: `locally_complete`. Alignment remains deterministic and advisory; it
  cannot save, submit, advance, approve, return, or reject a proposal.
- Implemented: moved the existing eight-dimension alignment assessment behind
  `/api/ai/proposal-alignment`. The endpoint requires both proposal preparation
  authority and AI assistance, rejects unknown fields and invalid types, runs
  the existing strict result schema on the server, and returns a private
  no-store DTO.
- Audit/privacy behavior: every successful assessment writes a fail-closed audit
  entry containing only a SHA-256 draft fingerprint, overall result, controlled
  dimension ratings, and bounded counts/flags. Proposal rationale, objectives,
  beneficiary text, and other draft prose are not copied into the audit entry or
  sent to an external AI provider.
- Interface: the proposal editor now shows progress and fetches the server
  result. A failed or malformed result is not displayed as valid guidance. The
  user must still choose Create Proposal or Save Changes separately.
- Commands/results: focused advisory/browser contracts pass 28/28; typecheck
  and lint pass; seeded Phase 2 SQL remains 168/168; and the authenticated
  browser/AI privacy gate passes 10/10. The browser opens a blank proposal,
  receives `Not Recommended`, keeps the Create Proposal action separate, and
  finishes with an unchanged proposal/program workflow fingerprint.
- Migration/security impact: no migration, feature-state change, external AI
  call, or shared/remote database operation occurred. The local browser harness
  removed its disposable stack after execution.
- Rollback: revert this checkpoint to restore the prior client-only check. Do
  not persist raw proposal prose in generic audit metadata or couple alignment
  output to a workflow transition.
- Next exact action: add a human-visible alignment assessment timestamp and
  stale-after-edit indicator so officers cannot mistake an older advisory result
  for an assessment of the current draft.

## Phase 3 proposal-alignment freshness guard

- Status: `locally_complete`. This improves interpretation of advisory output
  without changing any workflow authority or database state.
- Implemented: the strict alignment response now includes an allowlisted
  assessment timestamp and SHA-256 draft fingerprint. The proposal editor keeps
  a normalized local signature of the assessed form, SDG selection, and prior-
  initiative count.
- Interface behavior: a newly returned result is labelled `Current draft` with
  its assessment time. Any subsequent form, SDG, or prior-initiative edit marks
  it `Outdated after edits`, displays a clear warning, and changes the action to
  `Recheck edited draft`. Rerunning the server check returns the label to
  `Current draft`.
- Privacy behavior: the client uses its local normalized draft only for change
  comparison. The API returns a one-way fingerprint and never echoes raw draft
  prose in assessment metadata.
- Commands/results: focused advisory contracts pass 23/23; typecheck and lint
  pass; seeded Phase 2 SQL remains 168/168; and authenticated browser/AI privacy
  gates pass 10/10. The browser proves the current → edited/outdated → rechecked/
  current sequence and unchanged proposal/program workflow state.
- Migration/security impact: no migration, remote/shared operation, external AI
  request, or feature-state change occurred. The disposable stack was removed.
- Rollback: revert this checkpoint to remove freshness metadata and the stale
  indicator. Do not silently display an old result as current after draft edits.
- Next exact action: improve alignment usefulness by linking the check to
  approved need/evidence presence instead of treating a written rationale as
  sufficient community-need evidence.

## Phase 3 verified evidence-aware proposal alignment

- Status: `locally_complete`. The alignment check remains advisory and does not
  create evidence links or modify proposals.
- Implemented: the strict request now carries only optional approved-need and
  profiling-evidence UUID references alongside the draft. The server verifies
  an approved same-barangay community need and/or an `agape.profiling.aggregate.v2`
  snapshot from a completed/archived same-barangay cycle using explicit field
  allowlists.
- Alignment behavior: typed rationale alone is now weak context, not approved
  evidence. One verified source produces moderate community-need alignment;
  both an approved need and completed aggregate snapshot produce strong
  alignment. Invalid, non-approved, incomplete-cycle, or cross-barangay
  references fail with `422` rather than being silently credited.
- Interface integration: recommendation-originated draft starters pass their
  server-issued need/evidence references. Editing an existing proposal loads
  its validation-link references; ordinary new drafts start with no evidence.
  Evidence-reference changes also make an earlier alignment result stale.
- Audit/privacy behavior: the audit stores only the verified-evidence booleans
  and request fingerprint, never source content or draft prose. The response
  does not expose community-need descriptions or aggregate payloads.
- Commands/results: focused advisory contracts pass 23/23; typecheck and lint
  pass; seeded Phase 2 SQL remains 168/168; and the authenticated browser/AI
  privacy gate passes 10/10. The browser directly verifies the reserved
  same-barangay synthetic need plus completed snapshot returns a strong
  community-need dimension, then exercises the visible no-evidence editor. One
  unrelated Partner-selector timing failure occurred on the first attempt; an
  unchanged complete retry passed all scenarios.
- Migration/security impact: no migration, shared/remote operation, external AI
  call, or feature-state change occurred. The disposable stacks were removed.
- Rollback: revert this checkpoint to remove evidence verification. Do not
  restore prose-only evidence credit or trust client-supplied evidence flags.
- Next exact action: make the proposal draft starter preserve its approved need
  provenance when the officer explicitly saves the draft, without automatic
  submission or workflow advancement.

## Phase 3 recommendation provenance on explicit draft creation

- Status: `locally_complete`. Provenance is attached only after an authorized
  officer explicitly chooses Create Proposal; the recommendation itself still
  cannot save, submit, advance, approve, return, clear, or reject anything.
- Contract: proposal creation accepts one strict create-only
  `recommendation_context` containing an approved-need UUID, an optional
  aggregate-evidence UUID, and a lowercase SHA-256 recommendation fingerprint.
  Unknown nested fields, malformed identifiers, invalid fingerprints, and all
  attempts to replace provenance through the generic update route are rejected.
- Server verification: before inserting the draft, the API rechecks that the
  need is approved for the selected barangay and that any profiling evidence is
  an `agape.profiling.aggregate.v2` snapshot from a completed or archived cycle
  in that same barangay. It uses explicit read/write field allowlists.
- Persistence: successful human draft creation writes traceable community-need
  and optional profiling-evidence links with the one-way recommendation
  fingerprint. It does not retain recommendation prose. If link insertion
  fails, the API removes the newly created draft and SDG children and reports a
  failure instead of leaving a provenance-free partial draft.
- Interface: recommendation-originated draft starters send the strict context
  only on creation and show how many evidence links were preserved. Ordinary
  proposals and edits keep their existing behavior.
- Commands/results: focused proposal/advisory contracts pass 36/36; complete
  Node tests pass 231/231 with zero failures/skips; typecheck and lint pass; and
  the 168-page/route production build passes.
- Migration/security impact: no migration, runtime-state change, external AI
  request, or shared/remote database operation occurred. The existing V1 draft
  route remains authoritative and all feature flags remain false.
- Rollback: revert this checkpoint to remove create-only provenance transfer.
  Existing evidence links remain governed records and must not be hard-deleted
  as a rollback shortcut.
- Next exact action: surface preserved recommendation provenance on proposal
  detail/edit views so officers can verify the source before submission.

## Phase 3 preserved-evidence review in proposal editing

- Status: `locally_complete`. Officers can now see preserved evidence before
  changing or submitting a proposal; this is a read-only usability improvement.
- Interface: opening a draft loads its existing validation-link DTO and displays
  approved community needs, completed profiling evidence, link timestamps, and
  a clear `Recommendation provenance` marker for links created through an
  explicit recommendation-originated draft save.
- Failure behavior: the editor shows a visible evidence-load error and warns the
  officer to reload before relying on alignment. It does not silently interpret
  a failed evidence request as proof that the proposal has no evidence.
- Alignment integration: the same successfully loaded identifiers feed the
  server-verified alignment request. New and ordinary drafts reset evidence
  state so links cannot leak between editor sessions.
- Commands/results: focused advisory contracts pass 25/25; complete Node tests
  pass 232/232 with zero failures/skips; typecheck and lint pass.
- Migration/security impact: no migration, workflow mutation, external AI call,
  feature-state change, or remote/shared database operation occurred.
- Rollback: revert this checkpoint to remove the edit-view summary. The proposal
  validation-link data remains unchanged and visible in the detail panel.
- Next exact action: replace the legacy linked-record threshold wording and
  automatic validation interpretation with source-quality-aware guidance so an
  AI-preserved pair is not mistaken for completed human community validation.

## Phase 3 advisory provenance versus human-validation boundary

- Status: `locally_complete`. Recommendation-derived planning sources remain
  traceable but cannot satisfy the human community-validation gate.
- Database boundary: forward migration
  `20260818000980_phase3_advisory_provenance_boundary.sql` adds the controlled
  `validation | advisory_planning` provenance classification and replaces the
  legacy recomputation rule. The structural validation path now requires two
  human-validation links, including an approved community need from the
  proposal's barangay. Recommendation links are excluded.
- Correction behavior: when qualifying validation evidence is removed, stale
  validation actor/time metadata is cleared with the derived flag. Direct
  authenticated execution of the recomputation helper is revoked.
- Application behavior: explicit recommendation draft creation writes
  `advisory_planning`; ordinary officer-created evidence links retain the
  server-owned `validation` default. Editor/detail cards visibly label planning
  provenance and state that it does not complete human validation.
- Prescreening: guidance now describes the actual database rule and explicitly
  excludes recommendation planning provenance. AI still cannot move a proposal
  through any workflow state.
- Commands/results: complete Node tests pass 233/233; typecheck and lint pass;
  the 168-page/route production build passes. Two clean Phase 2 replays match at
  SHA-256 `67b0648f08c589ed01408852342f54bc08d803623df7e4b7fb25ef1cc0a1b88c`;
  catalog/runtime/Storage pgTAP passes 32/32, seeded pgTAP passes 178/178,
  behavioral security passes 83/83, and legacy-seed compatibility passes.
- Final local state: all disposable stacks were removed. No shared/remote
  database, feature flag, runtime mode, worker, or mutation authority changed.
- Rollback: keep the migration and provenance history after application; use a
  later forward correction if needed. At application level, revert the UI/API
  checkpoint without reclassifying existing governed links.
- Next exact action: validate and scope every manually linked validation source
  against its proposal parent before allowing the link, rather than trusting a
  caller-supplied polymorphic UUID.

## Phase 3 manual validation-link trust boundary

- Status: `locally_complete`. Manual evidence links now bind the selected
  source to the editable proposal before any governed link is inserted.
- Request boundary: proposal and source identifiers must be UUIDs; request
  bodies reject unknown keys; rationales are trimmed and bounded; and new
  links can use only community needs, surveys, field observations, or completed
  aggregate profiling evidence. Legacy survey-response and household-profile
  lineage remains readable but cannot be newly created through this route.
- Parent/source verification: the server loads an explicit proposal context,
  permits links only while the proposal is editable, and verifies approved or
  published source state plus exact barangay ownership. Profiling evidence must
  use `agape.profiling.aggregate.v2` from a completed or archived same-barangay
  cycle.
- Provenance and privacy: the server assigns `validation` provenance rather
  than trusting the caller. Database failures return generic messages and log
  only proposal identifiers and database error codes; no source payload or
  database message is exposed.
- Interface: the evidence picker requests only approved community needs and
  filters both needs and surveys to the proposal barangay before showing them.
- Commands/results: focused advisory/proposal tests pass 27/27; complete Node
  tests pass 234/234 with zero failures/skips; typecheck and lint pass; and the
  168-page/route production build passes.
- Migration/security impact: no migration, shared/remote database operation,
  feature-state change, workflow transition, or external AI call occurred.
- Rollback: revert this application checkpoint. Existing governed evidence
  links and provenance classifications remain unchanged.
- Next exact action: make validation-link hydration strict and fail closed so
  unsupported source types or source-query failures cannot silently produce an
  incomplete evidence review DTO.

## Phase 3 strict proposal-evidence reads

- Status: `locally_complete`. Proposal evidence review now returns either a
  complete allowlisted result or an explicit error; it no longer presents
  partially hydrated evidence as trustworthy.
- Stored-data checks: readable source and provenance values are checked against
  closed allowlists, and every stored source identifier must be a UUID. An
  unsupported stored row fails closed with metadata-only logging.
- Hydration behavior: all six legacy/current source lookups report database
  failures, and every governed link must resolve to an existing selected source
  before the response is returned. Missing sources produce a conflict instead
  of a card whose details are silently null.
- Interface correction: empty-state guidance lists only sources officers may
  actually link now. Legacy household lineage remains readable for historical
  compatibility but is no longer advertised as a new validation source.
- Commands/results: focused advisory/proposal tests pass 27/27; complete Node
  tests pass 234/234 with zero failures/skips; typecheck and lint pass.
- Migration/security impact: no migration, remote/shared database operation,
  workflow mutation, runtime-state change, or external AI call occurred.
- Rollback: revert this application checkpoint. Existing links remain intact.
- Next exact action: inspect the proposal validation-event controls and API for
  controls that claim destructive behavior despite the append-only evidence
  boundary, then replace any broken control with a working lifecycle action.

## Phase 3 retained validation-evidence interface

- Status: `locally_complete`. The proposal validation interface no longer
  offers destructive actions that the append-only API correctly refuses.
- Interface: validation events display a retained-history marker. The event
  delete control and evidence-file remove control were removed, so officers no
  longer receive a guaranteed `405` after confirming a destructive action.
- Editability: evidence upload is available only while the proposal is in an
  editable state and the parent has granted recording authority. Read-only
  review continues to show existing evidence and signed downloads.
- Commands/results: focused advisory/proposal tests pass 27/27; typecheck and
  lint pass with zero errors.
- Migration/security impact: no migration, database mutation, feature-state
  change, remote/shared operation, or external AI call occurred.
- Rollback: revert this UI checkpoint. The append-only API remains unchanged.
- Next exact action: replace the validation-event two-step service-role insert
  and best-effort hard-delete cleanup with one atomic authenticated RPC.

## Phase 3 atomic proposal-validation events

- Status: `locally_complete`. A validation event and all of its stakeholders
  now commit as one authenticated database transaction or not at all.
- Database boundary: forward migration
  `20260818000990_phase3_atomic_proposal_validation.sql` adds a fixed-search-path
  RPC that independently verifies the active actor capability, editable proposal
  state, same-barangay scope for barangay actors, method/date/summary bounds,
  stakeholder count, JSON types, allowed keys, and field lengths.
- Trigger compatibility: the RPC uses a transaction-local service claim only
  for its narrow internal graph inserts because the legacy derived-validation
  trigger updates the parent proposal. The original authenticated actor is
  retained explicitly on the event and durable audit; request claims are
  restored before the RPC returns.
- Application behavior: the API calls the RPC through the authenticated client,
  validates the returned `{ id }` DTO, maps controlled SQLSTATE classes, and no
  longer performs service-role table inserts or best-effort hard-delete cleanup.
- Executable verification: two clean Phase 2 replays match at SHA-256
  `1fdb942e2224603a534811a402061ddda635c36c3b37725dcf91758d93b4118b`;
  catalog/runtime/Storage pgTAP passes 32/32; seeded workflow pgTAP passes
  191/191, including 13 new atomic-validation cases; behavioral Auth,
  PostgREST, RPC, Storage, and concurrency checks pass 83/83; and legacy seed
  compatibility passes. All disposable stacks were removed.
- Application verification: complete Node tests pass 235/235 with zero
  failures/skips; typecheck and lint pass; and the 168-page/route production
  build passes.
- Migration/security impact: this migration was applied only to disposable
  loopback Supabase stacks. No shared/remote database, feature flag, runtime
  mode, worker, existing account, or mutation authority changed.
- Rollback: keep the forward migration and governed validation/audit history
  after application. Application rollback disables the calling control; it must
  not hard-delete validation evidence.
- Next exact action: harden validation-event reads and evidence uploads so
  database/Storage failures cannot silently return partial review data or leak
  provider/database error messages.

## Phase 3 private validation-evidence boundary

- Status: `locally_complete`. Validation evidence is now accepted, stored, and
  returned through a bounded private-file contract rather than trusting browser
  metadata or exposing Storage internals.
- Upload validation: files are limited to 10 MiB, empty files are rejected, and
  the declared MIME type must match a reviewed server-side file signature. The
  original name is sanitized and bounded, SHA-256 is computed server-side, and
  the generated Storage path uses only the validation ID, content hash, and a
  server-selected extension.
- Parent boundary: proposal and validation identifiers must be UUIDs, the
  validation must belong to the proposal, the proposal must remain editable,
  and barangay actors remain limited to their assigned proposal barangay.
- Read privacy: evidence responses use explicit allowlisted fields, never expose
  `storage_path`, and issue parent-authorized signed links for at most five
  minutes. Child query and signed-URL failures fail the entire review read
  instead of silently returning partial data.
- Audit/error behavior: every evidence read appends a durable metadata-only
  audit event and fails closed if that audit cannot be written. Database and
  Storage provider messages are not returned to callers or written to ordinary
  logs; failed metadata writes trigger checked object compensation.
- Commands/results: focused validation-evidence and advisory tests pass 31/31;
  complete Node tests pass 238/238 with zero failures/skips; typecheck and lint
  pass; and the 168-page/route production build passes.
- Migration/security impact: no migration, remote/shared database operation,
  feature-state change, workflow transition, worker action, or external AI call
  occurred.
- Rollback: revert this application checkpoint. Do not delete already retained
  evidence objects or their governed metadata merely to roll back the UI/API.
- Next exact action: make the validation workspace surface list and evidence
  fetch failures explicitly instead of presenting failed reads as empty review
  history.

## Phase 3 validation-review failure state

- Status: `locally_complete`. The validation workspace no longer treats failed
  event or linked-record reads as trustworthy empty history.
- Interface behavior: both review requests must succeed and return array DTOs.
  A failed request or malformed response clears stale local data, closes the
  picker, displays one explicit error with a Retry action, and disables link,
  event, and evidence mutations until a complete reload succeeds.
- Review accuracy: loading linked records now has its own progress state, and
  neither validation path can show an empty-state message while its source data
  is loading or unavailable.
- Commands/results: focused advisory/proposal tests pass 29/29; complete Node
  tests pass 238/238 with zero failures/skips; typecheck and lint pass; and the
  168-page/route production build passes.
- Migration/security impact: no migration, database operation, feature-state
  change, workflow transition, worker action, or external AI call occurred.
- Rollback: revert this UI checkpoint. API and database evidence protections
  remain in force.
- Next exact action: inspect the linked-record picker so candidate-source
  failures cannot be presented as a valid empty catalog or leave a stale source
  selection available for submission.

## Phase 3 validation-source picker reliability

- Status: `locally_complete`. Candidate-source failures are now distinguishable
  from a legitimate empty catalog and cannot leave a stale selection ready to
  submit.
- Loading behavior: opening or switching a source clears the prior candidate,
  rationale, selection, and error state. Non-success responses, malformed DTOs,
  mapping failures, and network failures show an inline Retry state and retain
  no prior candidate data.
- Mutation behavior: Link remains disabled during loading or after catalog
  failure. Network errors during save are handled visibly, and the saving state
  is always released through `finally` so the dialog cannot remain stuck.
- Commands/results: focused advisory/proposal tests pass 29/29; complete Node
  tests pass 238/238 with zero failures/skips; typecheck and lint pass.
- Migration/security impact: no migration, database operation, feature-state
  change, workflow transition, worker action, or external AI call occurred.
- Rollback: revert this picker checkpoint. Server-side source and parent binding
  remains authoritative.
- Next exact action: replace the picker's unchecked source-specific row casts
  with explicit allowlisted candidate DTO validation so malformed or excessive
  endpoint fields cannot enter the proposal evidence interface.

## Phase 3 barangay validation-link scope

- Status: `locally_complete`. Barangay validation users can now read and record
  evidence links through the intended capability, but only for proposals in
  their own assigned barangay.
- Authorization correction: link reads accept either ordinary proposal-read or
  validation-record authority. Link writes require the narrower
  `proposal.validation.record` capability instead of generic proposal review.
  This matches the Captain, Secretary, and Mother Leader capability matrix.
- Parent scope: both reads and writes load the proposal first, return not-found
  explicitly, fail on context-query errors, and deny an absent or mismatched
  barangay assignment before any service-role link query or mutation.
- Commands/results: focused advisory/proposal tests pass 29/29; complete Node
  tests pass 238/238 with zero failures/skips; typecheck and lint pass.
- Migration/security impact: no migration, database operation, feature-state
  change, account change, worker action, or external AI call occurred.
- Rollback: revert this API checkpoint. Do not broaden the route back to generic
  proposal review or remove the parent barangay check.
- Next exact action: provide one narrow, proposal-scoped validation-candidate
  API so the browser no longer downloads broad community-needs, survey,
  observation, or profiling endpoint rows and filters them client-side.

## Phase 3 proposal-scoped validation candidates

- Status: `locally_complete`. The evidence picker now consumes one narrow,
  proposal-owned candidate catalog rather than four broad operational APIs.
- Server authority: the new candidate route requires validation-record
  capability, validates proposal and source type, requires an editable proposal,
  enforces the authenticated barangay assignment, and derives every source
  query from the server-loaded proposal barangay.
- Data minimization: each source query uses explicit fields, eligible states,
  completed aggregate profiling evidence, ordering, and a 200-row cap. Output
  is reduced to strict `{ id, label, meta }` DTOs with bounded strings. Database
  or DTO failures return no partial catalog.
- Audit behavior: every successful catalog read writes a metadata-only durable
  audit containing source type and result count; an audit failure prevents the
  catalog response.
- Interface: the picker no longer receives or trusts a client barangay ID and
  no longer fetches broad community-needs, surveys, observations, or profiling
  endpoints. It verifies the narrow DTO shape before showing a candidate.
- Commands/results: focused advisory/proposal tests pass 29/29; complete Node
  tests pass 238/238 with zero failures/skips; typecheck and lint pass; and the
  168-page/route production build passes.
- Migration/security impact: no migration, database operation, feature-state
  change, workflow transition, worker action, or external AI call occurred.
- Rollback: revert this API/UI checkpoint together. The server-side link-write
  verification remains authoritative.
- Next exact action: inspect the proposal validation-event DTO itself and remove
  actor identifiers or stakeholder fields that are not required by the review
  interface, while preserving authorized stakeholder review.

## Phase 3 minimal validation-event DTO

- Status: `locally_complete`. Authorized reviewers still receive the names and
  roles needed for human validation review, but internal actor and join fields
  are no longer returned to the browser.
- Response minimization: stakeholder rows are rebuilt as explicit
  `{ id, stakeholder_name, role, present }` DTOs. Validation output omits the
  recorder UUID, and evidence output omits uploader UUID and internal
  `validation_id`; display names and governed file metadata remain available.
- Commands/results: focused advisory/proposal tests pass 29/29; typecheck and
  lint pass with zero errors.
- Migration/security impact: no migration, database operation, feature-state
  change, workflow transition, worker action, or external AI call occurred.
- Rollback: revert this response-shaping checkpoint. Do not restore unused actor
  identifiers to public DTOs.
- Next exact action: make validation-event creation and evidence upload controls
  recover cleanly from network exceptions so users are not left in a permanent
  saving/uploading state.

## Phase 3 resilient validation mutations

- Status: `locally_complete`. Validation-event creation and multi-file evidence
  upload recover from failed network requests without leaving controls stuck.
- Upload behavior: each selected file is isolated so one failure does not stop
  later files, successes still refresh the review, partial failure is reported,
  and upload state plus the file input are always reset in `finally`. The picker
  now advertises only the MIME families accepted by the server signature
  validator.
- Event behavior: create failures show a practical retry message, successful
  saves retain the existing flow, and the Save control always exits its busy
  state through `finally`.
- Commands/results: focused advisory/proposal tests pass 29/29; complete Node
  tests pass 238/238 with zero failures/skips; typecheck and lint pass.
- Migration/security impact: no migration, database operation, feature-state
  change, workflow transition, worker action, or external AI call occurred.
- Rollback: revert this UI checkpoint. Server-side transaction and file
  validation remain authoritative.
- Next exact action: inspect the proposal pre-screen and workflow controls for
  stale or contradictory validation state after a successful event/link refresh.

## Phase 3 proposal workflow refresh reliability

- Status: `locally_complete`. Proposal detail, create/edit, workflow, and Finance
  controls now recover from network failures and reload authoritative state after
  a successful transition.
- Detail behavior: the sheet tracks the requested proposal independently,
  displays an explicit Retry state instead of a blank body, rejects missing or
  malformed detail responses, and always clears its loading state.
- Workflow accuracy: every successful submit, advance, return, resubmit, reject,
  and Finance-clear action reloads the complete proposal detail. This refreshes
  derived community-validation state, pre-screening checks, Finance metadata,
  and append-only review history instead of patching only a local status.
- Control recovery: proposal-list loading, proposal create/edit, workflow, and
  Finance actions use guarded request handling and `finally` cleanup so buttons
  and spinners do not remain stuck after a network exception.
- Commands/results: focused advisory/proposal tests pass 29/29; complete Node
  tests pass 238/238 with zero failures/skips; typecheck and lint pass; and the
  168-page/route production build passes.
- Migration/security impact: no migration, database operation, feature-state
  change, workflow action, worker action, or external AI call occurred during
  verification.
- Rollback: revert this UI checkpoint. Server-side workflow authority remains
  unchanged.
- Next exact action: inspect the server proposal-detail compatibility DTO and
  workflow response contracts for fields that can be removed or validated
  before the UI trusts them.

## Phase 3 proposal compatibility DTO boundary

- Status: `locally_complete`. V1 proposal compatibility reads and workflow
  responses now expose and accept only the state needed by the working officer
  interface.
- Read minimization: proposal list, create-result, and detail field lists omit
  creator, Finance approver, and community-validation actor UUIDs. Detail SDG
  rows no longer return their unused internal junction ID.
- Detail correctness: proposal IDs are UUID-validated before querying, missing
  rows now return 404 through `maybeSingle`, and the stale comment suggesting
  legacy submitter detail access was removed. Institutional history continues
  through its summary-only adapter.
- Client trust: workflow transitions must return a recognized proposal status,
  and Finance clearance must return the exact success DTO before the interface
  reports success or refreshes authoritative detail.
- Commands/results: focused advisory/proposal tests pass 30/30; complete Node
  tests pass 239/239 with zero failures/skips; typecheck and lint pass.
- Migration/security impact: no migration, database operation, feature-state
  change, workflow action, worker action, or external AI call occurred.
- Rollback: revert this API/UI checkpoint together. Do not restore unused actor
  identifiers to compatibility responses.
- Next exact action: audit the printable PPF proposal page for direct
  service-role reads, raw source hydration, and fields that bypass the newly
  minimized proposal/evidence APIs.

## Phase 3 redacted printable PPF

- Status: `locally_complete`. The printable proposal form now uses a reviewed,
  fail-closed evidence projection and no longer acts as an unguarded alternate
  route to validation identities or file names.
- Access/query boundary: printing requires proposal-review capability, validates
  the proposal UUID, checks proposal/link/event and every source-hydration query,
  validates stored source/provenance shapes, requires every source to resolve,
  and appends a metadata-only durable print-read audit.
- Redaction: the client receives no Partner contact person, stakeholder name,
  evidence filename, legacy attestation free text, source UUID, or source-row ID.
  Consultation output shows present/total counts, optional role categories, and
  retained-file counts instead.
- Provenance: advisory-planning links remain visible but are explicitly labeled
  as planning-only. Legacy household lineage remains code/sitio-only, and legacy
  survey response lineage resolves without exposing respondent identity.
- Authority/document correction: the stale President wording is absent;
  Researcher evidence review and PARAYA Director final approval are separate
  signature blocks.
- Commands/results: focused advisory/proposal tests pass 31/31; complete Node
  tests pass 240/240 with zero failures/skips; typecheck and lint pass; and the
  168-page/route production build passes.
- Migration/security impact: no migration, database operation, feature-state
  change, workflow action, worker action, print action, or external AI call
  occurred during verification.
- Rollback: revert the PPF checkpoint. Do not restore validation names, file
  names, Partner contact data, or legacy free text to the printable artifact.
- Next exact action: audit remaining proposal compatibility service-role reads
  for missing durable read audits and decide which operational reads need an
  audited narrow adapter without changing current workflow authority.

## Phase 3 audited proposal compatibility reads

- Status: `locally_complete`. All service-role proposal compatibility reads now
  append a durable audit before returning their DTO.
- Operational reads: list reads record only result count; detail reads record
  only proposal status and parent ID. Audit failure prevents the service-role
  response rather than exposing an unaudited proposal payload.
- Historical adapter: institutional summary reads remain limited to title,
  status, and date for rows created by that identity, and now record only the
  returned count. Audit failure also fails this read closed.
- Commands/results: focused advisory/proposal tests pass 31/31; complete Node
  tests pass 240/240 with zero failures/skips; typecheck and lint pass.
- Migration/security impact: no migration, database operation, feature-state
  change, workflow action, worker action, or external AI call occurred.
- Rollback: revert this API checkpoint only if necessary. Do not restore
  unaudited service-role proposal reads.
- Next exact action: inspect proposal creation, where the parent, SDGs, and
  recommendation provenance are still written in separate transactions with
  compensating hard deletes, and replace that graph write atomically.
