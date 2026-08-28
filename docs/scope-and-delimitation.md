# Scope and Delimitation

This document is a research-facing summary of the canonical [AGAPE scope baseline](requirements/agape-scope-baseline.md). If wording conflicts, the canonical baseline and its Confirmed requirements govern.

## Scope

AGAPE is a responsive, internet-dependent platform for the PARAYA Office of Dr. Yanga’s Colleges, Inc. It supports community profiling and needs assessment, partnerships, proposals and human approval, budget monitoring, volunteers, programs, donations/resources, analytics, reports, impact, communication, and infrastructure administration. The platform supports multiple partner barangays, with Biñang 2nd as the primary resident-profiling pilot unless another barangay is formally authorized and prepared.

### Actors and access

Login roles are PARAYA Director, Associate, Researcher, Finance Officer, Barangay Captain, Secretary, Mother Leader, Volunteer, and System Admin. Institutional offices, student organizations, departments, and external organizations are non-login Partner/Proponent records. Existing institutional login identities may remain temporarily as read-only migration views of their historical proposals and programs.

System Admin manages accounts, audit, recovery status, and infrastructure. Admin has no routine resident or operational-domain access. Finance reviews and clears/returns the budget component but cannot finally approve or reject projects. Only the PARAYA Director performs final project approval/rejection. Role capabilities are enforced server-side and in database policy; per-user permission overrides can deny but not grant authority outside a role.

### Resident profiling

Profiling covers selected/sample households rather than a complete census. All usual residents of a selected household may be represented subject to household participation consent and adult consent or guardian authorization for minors. Mother Leaders manually collect or import pending packages only within effectively assigned sitios. The Secretary approves/returns packages and resolves same-barangay duplicate candidates. The Captain sees approved own-barangay data and may endorse a completed cycle. The Researcher manages cycles, authorized detail, complex duplicates, and lifecycle corrections. Director and Associate receive aggregates only. Admin, Finance, Volunteers, and institutional roles receive no resident detail.

The normalized model contains authoritative sitios and assignments; privacy notices/settings; profiling cycles; official population snapshots; sampled contact/refusal outcomes; stable household and resident IDs; effective household memberships; immutable package and resident versions; consent; validation and lifecycle events; and import staging/errors/duplicate decisions. Household and resident codes are database-generated, barangay-prefixed, immutable, and never reused.

Profiling may collect controlled demographic, socioeconomic, education, employment, skills, broad support/vulnerability, household-condition, utility, sanitation, device, hazard, and planning-need data. Government ID numbers, photographs, biometrics, exact GPS, exact income, clinical diagnoses/documents, passwords, and unnecessary medical free text are prohibited. An identifiable resident record is not created without the required consent.

Existing `household_profiles` records are `legacy_unverified`, read-only, and retained only for historical links. They do not enter approved totals, beneficiary calculations, exports, or AI. The system never fabricates resident rows from legacy `member_count`.

### Import, validation, and lifecycle

Mother Leaders may submit an XLSX workbook with Household/Resident sheets or paired CSVs. Files are parsed server-side, limited to 10 MB and 10,000 combined rows, checked for template version, controlled columns/values, linkage, consent, prohibited fields, and duplicate candidates. Raw bytes are never retained. Sanitized staging is purged after commit or after 30 days when abandoned/failed. Commit is atomic, idempotent, creates pending packages, and never auto-merges duplicates.

Cycle workflow is `draft → collecting → validating → completed → archived`. Submission workflow is `draft → pending → approved | returned → superseded`. Household lifecycle is `active | moved | dissolved | merged`; resident lifecycle is `active | inactive | deceased | merged`. Corrections and decisions require expected versions and immutable audit reasons.

### Analytics, reporting, and AI boundary

Profiling analytics use only approved packages and always disclose cycle, sample size, target/coverage, source, as-of date, official-versus-sample separation, and data-quality metadata. Small cells from one through four are suppressed at the initial configurable threshold of five, with complementary suppression and no drill-through. Only audited aggregate CSV/XLSX profiling exports are available; identifiable export is outside Phase 1.

AI may later provide advisory profiling suggestions, project recommendations, alignment analysis, narrative reports, and unaddressed-need alerts from purpose-built de-identified aggregates. AI never receives identifiable resident data and never automatically creates/submits/approves/rejects a proposal. Phase 1 disables raw legacy-household AI and cross-tab queries; full recommendation automation remains deferred.

### Proposals, finance, programs, volunteers, and partnerships

Authorized PARAYA personnel encode proposals, including a recorded non-login origin Partner/Proponent where applicable. Required-field checks warn/block incomplete submission rather than auto-reject. Finance may clear or return budget concerns; Director alone finally approves/rejects, with remarks and immutable decision history. Hard deletion of governed proposal/program/budget history is disabled.

Programs, volunteer assignments, partnerships, previous programs, and structured proposal/budget expansion remain governed by the canonical phased plan. Phase 4 volunteer matching prioritizes eligibility, skills, availability, then Haversine proximity and exposes only a distance band/within-radius result. Volunteers may provide a rounded approximate base only with consent. Secure program invitations are expiring, capacity-bound, hashed, revocable, and audited; ordinary volunteers can create them only when designated as program leaders. Phase 4 remains disabled until its disposable replay and authorization gate pass. Finance monitoring is not payment processing or a replacement accounting system.

The initial Finance Integrity feature creates tamper-evident proofs for two finalized record classes only: Finance-cleared proposal budget snapshots and Finance-verified liquidation summaries. The platform computes and retains a canonical SHA-256 commitment, then may submit only that hash and minimal non-personal proof metadata through a provider-neutral anchoring relay. It never transfers funds, exposes cryptocurrency or wallets to users, or sends line-item descriptions, payees, contacts, receipts, attachments, resident data, or complete financial documents outside AGAPE. Live anchoring remains disabled until its provider, network, contract, custody, retention, and operating procedures are approved.

### Surveys, donations, and impact

Surveys use strict server-owned actor/barangay fields, published-window checks, question-to-survey binding, controlled answer validation, and atomic response creation. Donations use controlled mutations, parent-bound distributions, locked inventory checks, and archive/void corrections instead of hard deletion. Impact indicators, consented qualitative records, and follow-up transitions use controlled schemas and lifecycle history; Admin has no ordinary access.

## Delimitations and deployment conditions

- The platform requires internet connectivity and depends on configured Supabase and notification/AI providers.
- Phase 0 live-schema reconciliation, credential-rotation proof, Auth redirect configuration, disposable-clone migration/RLS tests, and storage-policy inventory are production prerequisites.
- Resident profiling remains behind `AGAPE_PROFILING_V2_ENABLED=false` until official sitios, assignments, privacy notice/controller details, sampling plan, official totals/source, retention/correction rules, and privacy approval are configured.
- Synthetic data must be used before authorization for real Biñang 2nd data.
- Road-distance routing, OCR, full demographic reporting, AI recommendations/beneficiary estimation/unmet-need automation, and blockchain are outside Phase 1.
- The Finance-cleared budget and Finance-verified liquidation proof boundary is approved for local development. The external provider, network, contract, wallet/custody process, and research claim remain **Needs confirmation**; production anchoring stays disabled until they are approved.
- Rollback disables new features while retaining normalized/versioned data; it does not restore Admin roaming, broad direct access, raw AI queries, identifiable exports, or hard deletion.
