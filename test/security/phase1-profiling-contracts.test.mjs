import assert from "node:assert/strict";
import test from "node:test";

import { deriveMinorStatus, findProhibitedProfileKeys, parseProfilingPackage, PROFILING_TEMPLATE_VERSION } from "../../src/lib/profiling/contracts.ts";
import { normalizeProfilingImportHeader, validateProfilingImportHeaders } from "../../src/lib/profiling/import-headers.ts";
import { applyComplementarySuppression, normalizeSuppressionThreshold, validateProfilingAggregateDTO } from "../../src/lib/profiling/privacy.ts";
import { getAuthorizedProfilingCycleContext, getProfilingSubmissionMutationDTO } from "../../src/lib/profiling/server-context.ts";

const cycleId = "11111111-1111-4111-8111-111111111111";
const sitioId = "22222222-2222-4222-8222-222222222222";
const base = {
  cycle_id: cycleId, household_row_key: "HH-ROW-1", participation_consent: "granted",
  household_consent_name: "Maria Sample", privacy_notice_version: "v1", sample_reference: "SMP-00000001", expected_version: 0,
  household: { sitio_id: sitioId, devices: [], hazards: [], needs: [], anonymous_nonparticipant_count: 0 },
  residents: [{ household_row_key: "HH-ROW-1", first_name: "Ana", last_name: "Sample", estimated_age: 30, sex: "female", civil_status: "single", relationship_to_head: "household_head", education_level: "college", occupation_category: "public_service", consent_status: "granted", skills: [], disability_support: [], health_support: [], planning_needs: [] }],
};

test("identifiable residents require adult or guardian consent", () => {
  assert.equal(parseProfilingPackage(base).success, true);
  assert.equal(parseProfilingPackage({ ...base, residents: [{ ...base.residents[0], consent_status: "refused" }] }).success, false);
  assert.equal(parseProfilingPackage({ ...base, residents: [{ ...base.residents[0], estimated_age: 8 }] }).success, false);
  assert.equal(parseProfilingPackage({ ...base, residents: [{ ...base.residents[0], estimated_age: 8, guardian_name: "Parent", guardian_relationship: "mother" }] }).success, true);
  assert.equal(parseProfilingPackage({ ...base, residents: [{ ...base.residents[0], is_minor: false }] }).success, false);
  assert.equal(parseProfilingPackage({ ...base, residents: [{ ...base.residents[0], resident_id: "not-a-uuid" }] }).success, false);
  assert.equal(deriveMinorStatus("2010-08-18", null, "2026-08-17"), true);
  const birthdayBoundary = { ...base, residents: [{ ...base.residents[0], birth_date: "2008-08-18", estimated_age: null, guardian_name: "Parent", guardian_relationship: "mother" }] };
  assert.equal(parseProfilingPackage(birthdayBoundary, "2026-08-17").success, true);
  assert.equal(parseProfilingPackage(birthdayBoundary, "2026-08-18").success, false);
});

test("prohibited resident fields fail closed at every nesting level", () => {
  assert.deepEqual(findProhibitedProfileKeys({ resident: { government_id: "x", exact_gps: "x" } }), ["resident.government_id", "resident.exact_gps"]);
  assert.equal(parseProfilingPackage({ ...base, residents: [{ ...base.residents[0], clinical_document: "secret" }] }).success, false);
  assert.deepEqual(findProhibitedProfileKeys({ resident: { governmentId: "x", nationalIdNumber: "x", medicalNotes: "x" } }), ["resident.governmentId", "resident.nationalIdNumber", "resident.medicalNotes"]);
});

test("small cells and a visible peer receive complementary suppression", () => {
  assert.throws(() => normalizeSuppressionThreshold(4), /5 to 100/);
  const cells = applyComplementarySuppression([2, 8, 20], 5);
  assert.deepEqual(cells.map((cell) => cell.suppressed), [true, true, false]);
  assert.equal(cells[0].value, null);
  const aggregate = { schemaVersion: "agape.profiling.aggregate.v2", cycle: { id: cycleId, name: "Synthetic pilot", status: "completed", reportingDate: "2026-08-17" }, sample: { method: "systematic sample", targetHouseholds: 10, registeredHouseholds: 10, participatingHouseholds: 8, nonparticipatingHouseholds: 2, approvedHouseholds: 8, approvedResidents: 20, coveragePercent: 80, responseRatePercent: 80 }, source: { kind: "approved_sample", legacyExcluded: true, evidenceSnapshotId: null }, official: { totalPopulation: 100, totalHouseholds: 25, sourceName: "Official register", asOfDate: "2026-08-01", verified: true }, asOf: "2026-08-17T12:00:00+08:00", privacy: { suppressionThreshold: 5, complementarySuppression: true }, dataQuality: { pendingPackages: 0, returnedPackages: 0, excludedPackages: 2, unresolvedDuplicates: 0 }, cells: [] };
  assert.equal(validateProfilingAggregateDTO(aggregate).cycle.name, "Synthetic pilot");
  assert.equal(validateProfilingAggregateDTO(aggregate).sample.nonparticipatingHouseholds, 2);
  const { nonparticipatingHouseholds: _, ...incompleteSample } = aggregate.sample;
  assert.throws(() => validateProfilingAggregateDTO({ ...aggregate, sample: incompleteSample }));
  assert.throws(() => validateProfilingAggregateDTO({ ...aggregate, first_name: "leak" }));
});

test("import headers reject unknown and normalized duplicates while preserving resident identity", () => {
  assert.equal(normalizeProfilingImportHeader("\uFEFFHousehold Row-Key"), "household_row_key");
  const issues = validateProfilingImportHeaders(["\uFEFFhousehold_row_key", "Household Row Key", "unexpected_column"], ["household_row_key"]);
  assert.ok(issues.some((issue) => issue.message === "Duplicate import column" && issue.field === "household_row_key"));
  assert.ok(issues.some((issue) => issue.message === "Unknown import column" && issue.field === "unexpected_column"));
  assert.equal(PROFILING_TEMPLATE_VERSION, "AGAPE-PROFILING-V1");
});

test("cycle context and mutation DTOs are resolved only through actor-scoped RPC summaries", async () => {
  const calls = [];
  const client = { rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === "phase1_list_profiling_cycles") return { data: [{ id: cycleId, barangay_id: "44444444-4444-4444-8444-444444444444", status: "collecting", collection_starts_on: "2026-08-01", collection_ends_on: "2026-08-31", row_version: 3, name: "ignored" }], error: null };
    return { data: [{ id: "55555555-5555-4555-8555-555555555555", row_version: 7, household_code: "ignored" }], error: null };
  } };
  const cycle = await getAuthorizedProfilingCycleContext(client, cycleId);
  assert.deepEqual(cycle, { id: cycleId, barangay_id: "44444444-4444-4444-8444-444444444444", status: "collecting", collection_starts_on: "2026-08-01", collection_ends_on: "2026-08-31", row_version: 3 });
  assert.deepEqual(await getProfilingSubmissionMutationDTO(client, cycleId, "55555555-5555-4555-8555-555555555555"), { id: "55555555-5555-4555-8555-555555555555", rowVersion: 7 });
  assert.deepEqual(calls.map(([name]) => name), ["phase1_list_profiling_cycles", "phase1_list_profiling_submissions"]);
});
