# Phase 1 Profiling Interface Traceability

This matrix is implementation guidance and test traceability, not release evidence. Profiling remains feature-gated and database runtime remains `off`.

| Actor / workflow | Browser interface | API boundary | Database boundary | Executable proof |
|---|---|---|---|---|
| Researcher setup | `ResearcherOperationsPanel` | prefix, sitios, privacy notice, official snapshots, cycles, sample register, assignments | capability-scoped `phase1_*` setup RPCs | Packet 5 source/contract tests; authenticated E2E pending canonical replay |
| Researcher corrections | `ResearcherOperationsPanel` lifecycle and replacement forms | lifecycle, replacement, duplicate routes | expected-version lifecycle/replacement RPCs | Packet 6 malicious/concurrency suite pending canonical replay |
| Mother Leader queue/outcomes | `ProfilingWorkspace` assigned-sitio queue | sample register and sample outcomes | assigned-sitio RPC checks | Packet 5 source tests; JWT/E2E pending replay |
| Mother Leader manual package | Household/resident wizard and privacy notice | submission create/revise/submit | atomic versioned submission RPCs | contract tests; E2E pending replay |
| Mother Leader import | Versioned XLSX/paired CSV panel | template, preview, commit | staged import and atomic commit RPCs | parser tests; behavioral import E2E pending replay |
| Secretary validation | `SecretaryReviewPanel` structured household, roster, and consent review | detail and decision routes | scoped detail and expected-version decision RPCs | Packet 5 source tests; JWT/concurrency/E2E pending replay |
| Captain oversight | aggregate panel, approved package list, endorsement | aggregate, detail, endorsement | own-barangay read and versioned endorsement RPCs | contract tests; JWT/E2E pending replay |
| Director/Associate analytics | `ProfilingAggregatePanel` only | aggregate and audited export | de-identified aggregate RPC | strict aggregate/privacy tests; AI interception pending replay |

## Reset and privacy invariants

- Changing cycles clears sitio, sample, import batch, selected submission, files, and resident/household form state.
- Collectors read the configured approved privacy notice; they cannot type or substitute its version.
- Secretary approval is available only after opening the detailed household, roster, and consent comparison.
- Aggregate screens use the strict `agape.profiling.aggregate.v2` DTO and provide no resident drill-through.
- No identifiable profiling export or raw JSON workflow screen is provided.

## Remaining executable gate dependency

The UI and API mappings above require direct JWT/RLS, malicious RPC, concurrency, Storage, and authenticated browser execution on the canonical disposable database chain. Those results cannot be claimed until the authoritative capture and baseline are supplied and approved.
