import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createReleaseGateHttpClient, runSynchronizedRace } from "./lib/release-gate-http.mjs";

const PASSWORD = "SyntheticReleaseGateOnly!2026";
const ALPHA = "f2100000-0000-4000-8000-000000000001";
const BETA = "f2100000-0000-4000-8000-000000000002";
const NORTH = "f2300000-0000-4000-8000-000000000001";
const SOUTH = "f2300000-0000-4000-8000-000000000002";
const COLLECTING = "f2600000-0000-4000-8000-000000000002";
const COMPLETED = "f2600000-0000-4000-8000-000000000004";
const DRAFT = "f2600000-0000-4000-8000-000000000001";
const VALIDATING = "f2600000-0000-4000-8000-000000000003";
const NOTICE = "f2500000-0000-4000-8000-000000000001";
const PASSWORD_USERS = [
  ["admin", "f2200000-0000-4000-8000-000000000001"],
  ["director", "f2200000-0000-4000-8000-000000000002"],
  ["associate", "f2200000-0000-4000-8000-000000000003"],
  ["researcher", "f2200000-0000-4000-8000-000000000004"],
  ["finance", "f2200000-0000-4000-8000-000000000005"],
  ["captain-alpha", "f2200000-0000-4000-8000-000000000006"],
  ["secretary-alpha", "f2200000-0000-4000-8000-000000000007"],
  ["mother-alpha", "f2200000-0000-4000-8000-000000000008"],
  ["volunteer", "f2200000-0000-4000-8000-000000000009"],
  ["pending", "f2200000-0000-4000-8000-000000000010"],
  ["suspended", "f2200000-0000-4000-8000-000000000011"],
  ["inactive", "f2200000-0000-4000-8000-000000000012"],
  ["office-history", "f2200000-0000-4000-8000-000000000013"],
  ["organization-history", "f2200000-0000-4000-8000-000000000014"],
  ["department-history", "f2200000-0000-4000-8000-000000000015"],
  ["mother-unassigned", "f2200000-0000-4000-8000-000000000016"],
  ["mother-expired", "f2200000-0000-4000-8000-000000000017"],
  ["mother-cross-sitio", "f2200000-0000-4000-8000-000000000018"],
  ["deny-profiling", "f2200000-0000-4000-8000-000000000019"],
];
const ACTIVE_SYNTHETIC_IDS = PASSWORD_USERS
  .filter(([name]) => !["pending", "suspended", "inactive"].includes(name))
  .map(([, id]) => id);
const COUNTED_RESOURCES = [
  "profiling_households", "profiling_residents", "profiling_submissions",
  "profiling_events", "profiling_import_batches", "profiling_import_rows",
  "profiling_lifecycle_events",
  "audit_logs", "storage_objects",
];

function validPayload({
  cycleId = COLLECTING,
  sitioId = NORTH,
  sampleReference = "SMP-SYNCOL005",
  residentId,
  age = 30,
} = {}) {
  return {
    cycle_id: cycleId,
    household_row_key: sampleReference,
    participation_consent: "granted",
    household_consent_name: "Synthetic Household Signer",
    privacy_notice_version: "synthetic-v1",
    sample_reference: sampleReference,
    expected_version: 0,
    household: {
      sitio_id: sitioId,
      income_bracket: "not_stated",
      housing_condition: "not_stated",
      electricity: "not_stated",
      water_source: "not_stated",
      sanitation: "not_stated",
      internet_access: "not_stated",
      devices: [], hazards: [], needs: [], anonymous_nonparticipant_count: 0,
    },
    residents: [{
      ...(residentId ? { resident_id: residentId } : {}),
      household_row_key: sampleReference,
      first_name: "Synthetic",
      last_name: "Participant",
      estimated_age: age,
      sex: "not_stated",
      civil_status: "not_stated",
      relationship_to_head: "household_head",
      education_level: "not_stated",
      school_category: "not_stated",
      employment_status: "not_stated",
      occupation_category: "not_stated",
      income_bracket: "not_stated",
      is_enrolled: false,
      skills: [], disability_support: [], health_support: [], planning_needs: [],
      pregnancy_status: false,
      is_solo_parent: false,
      is_4ps_member: false,
      consent_status: "granted",
    }],
  };
}

function clone(value) {
  return structuredClone(value);
}

function isDenied(result) {
  return !result.ok && [400, 401, 403, 404, 409].includes(result.status);
}

function sqlState(result) {
  return typeof result.data?.code === "string" ? result.data.code : null;
}

export function phase1HttpGateContract() {
  return {
    schema: "agape.phase1-http-gates.v1",
    jwtCases: 11,
    rpcAbuseCases: 16,
    directTableCases: 36,
    concurrencyCases: 10,
    storageCases: 15,
    reconciliationCases: 6,
    rollbackCases: 5,
    finalState: { profilingMode: "off" },
  };
}

function assertExactKeys(value, keys, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} is not an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} contains missing or unknown fields`);
}

function assertStrictAggregate(value) {
  assertExactKeys(value, ["schemaVersion", "cycle", "sample", "source", "official", "asOf", "privacy", "dataQuality", "cells"], "aggregate");
  assert.equal(value.schemaVersion, "agape.profiling.aggregate.v2");
  assertExactKeys(value.cycle, ["id", "name", "status", "reportingDate"], "aggregate.cycle");
  assertExactKeys(value.sample, ["method", "targetHouseholds", "registeredHouseholds", "participatingHouseholds", "nonparticipatingHouseholds", "approvedHouseholds", "approvedResidents", "coveragePercent", "responseRatePercent"], "aggregate.sample");
  assertExactKeys(value.source, ["kind", "legacyExcluded", "evidenceSnapshotId"], "aggregate.source");
  assertExactKeys(value.official, ["totalPopulation", "totalHouseholds", "sourceName", "asOfDate", "verified"], "aggregate.official");
  assertExactKeys(value.privacy, ["suppressionThreshold", "complementarySuppression"], "aggregate.privacy");
  assertExactKeys(value.dataQuality, ["pendingPackages", "returnedPackages", "excludedPackages", "unresolvedDuplicates"], "aggregate.dataQuality");
  assert.ok(Array.isArray(value.cells), "aggregate.cells is not an array");
  for (const cell of value.cells) {
    assertExactKeys(cell, ["dimension", "key", "count"], "aggregate cell");
    assertExactKeys(cell.count, ["suppressed", "value", "label"], "aggregate cell count");
  }
}

export async function runPhase1HttpGates({ apiUrl, anonKey, readCounts, expectedPort = 54321 }) {
  assert.equal(typeof readCounts, "function", "a fixed disposable database count reader is required");
  const client = createReleaseGateHttpClient({ apiUrl, anonKey, expectedPort });
  const registryPath = resolve(import.meta.dirname, "..", "test", "gates", "phase1-security-scenarios.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const tokens = new Map();
  let passed = 0;
  let rollbackBaseline = null;
  const pass = () => { passed += 1; };
  const authenticate = async (name) => {
    if (!tokens.has(name)) {
      tokens.set(name, (await client.signInWithPassword(`${name}@release-gate.invalid`, PASSWORD)).accessToken);
    }
    return tokens.get(name);
  };
  const serviceCounts = async () => {
    const counts = await readCounts();
    assert.ok(counts && typeof counts === "object" && !Array.isArray(counts), "disposable count reader returned an invalid value");
    assert.deepEqual(Object.keys(counts).sort(), [...COUNTED_RESOURCES].sort(), "disposable count reader returned an unexpected shape");
    for (const value of Object.values(counts)) assert.ok(Number.isInteger(value) && value >= 0, "disposable count reader returned a non-integer count");
    return counts;
  };
  const expectNoSideEffect = async (before, label) => {
    const after = await serviceCounts();
    assert.deepEqual(after, before, `${label} changed governed row counts`);
  };
  const expectDenied = (result, label, states) => {
    const databaseException = !result.ok && result.status >= 400 && result.status < 600 && states?.includes(sqlState(result));
    assert.ok(isDenied(result) || databaseException, `${label} was not denied (${result.status})`);
    if (states?.length) assert.ok(states.includes(sqlState(result)), `${label} returned unexpected SQLSTATE ${sqlState(result)}`);
  };
  const expectOk = (result, label) => assert.ok(result.ok, `${label} failed (${result.status}, ${sqlState(result) ?? "no SQLSTATE"})`);
  const race = async (id, tasks, expectedWinners = 1, acceptedLoserStates = ["23505", "23514", "40001"]) => {
    const results = await runSynchronizedRace(tasks);
    assert.ok(results.every((result) => result.status === "fulfilled"), `${id} had a transport failure`);
    const responses = results.map((result) => result.value);
    const winners = responses.filter((result) => result.ok);
    const losers = responses.filter((result) => !result.ok);
    const responseSummary = responses.map((result) => `${result.status}/${sqlState(result) ?? "none"}`).join(",");
    assert.equal(winners.length, expectedWinners, `${id} had ${winners.length} material winner(s); responses=${responseSummary}`);
    for (const loser of losers) assert.ok(acceptedLoserStates.includes(sqlState(loser)), `${id} loser returned unexpected SQLSTATE ${sqlState(loser)}`);
    return { winners, losers, responses };
  };

  const director = await authenticate("director");
  const runtime = await client.rpc("phase1_set_profiling_runtime", {
    p_mode: "synthetic",
    p_synthetic_user_ids: ACTIVE_SYNTHETIC_IDS,
    p_synthetic_barangay_ids: [ALPHA, BETA],
    p_privacy_approved: false,
  }, { accessToken: director });
  assert.ok(runtime.ok, `could not enter disposable synthetic profiling mode (${runtime.status})`);

  try {
    const jwtExecutors = {
      "admin-profiling-denied": async () => {
        const result = await client.postgrest("profiling_households?select=id&limit=1", { accessToken: await authenticate("admin") });
        assert.ok(isDenied(result) || (result.ok && Array.isArray(result.data) && result.data.length === 0));
      },
      "researcher-cycle-read": async () => {
        const result = await client.rpc("phase1_list_profiling_cycles", { p_barangay_id: ALPHA }, { accessToken: await authenticate("researcher") });
        assert.ok(result.ok && Array.isArray(result.data) && result.data.length >= 4);
      },
      "deny-override-profiling": async () => {
        const before = await serviceCounts();
        const result = await client.rpc("phase1_list_profiling_cycles", { p_barangay_id: ALPHA }, { accessToken: await authenticate("deny-profiling") });
        expectDenied(result, "profiling deny override", ["42501"]); await expectNoSideEffect(before, "profiling deny override");
      },
      "finance-resident-denied": async () => {
        const result = await client.postgrest("profiling_residents?select=id&limit=1", { accessToken: await authenticate("finance") });
        assert.ok(isDenied(result) || (result.ok && Array.isArray(result.data) && result.data.length === 0));
      },
      "legacy-resident-denied": async () => {
        const result = await client.postgrest("profiling_residents?select=id&limit=1", { accessToken: await authenticate("office-history") });
        assert.ok(isDenied(result) || (result.ok && Array.isArray(result.data) && result.data.length === 0));
      },
      "mother-cross-sitio-denied": async () => {
        const result = await client.rpc("phase1_list_profiling_submissions", { p_cycle_id: COLLECTING }, { accessToken: await authenticate("mother-cross-sitio") });
        assert.ok(result.ok && Array.isArray(result.data) && result.data.length === 0);
      },
      "mother-unassigned-denied": async () => {
        const before = await serviceCounts();
        const result = await client.postgrest("profiling_submissions", { method: "POST", accessToken: await authenticate("mother-unassigned"), body: {} });
        expectDenied(result, "unassigned Mother Leader direct insert"); await expectNoSideEffect(before, "unassigned Mother Leader direct insert");
      },
      "mother-expired-denied": async () => {
        const before = await serviceCounts();
        const result = await client.rpc("phase1_create_profiling_submission", {
          p_cycle_id: COLLECTING, p_sitio_id: NORTH, p_payload: validPayload(), p_source_type: "manual", p_import_batch_id: null,
        }, { accessToken: await authenticate("mother-expired") });
        expectDenied(result, "expired Mother Leader create", ["42501"]); await expectNoSideEffect(before, "expired Mother Leader create");
      },
      "pending-auth-denied": async () => {
        const before = await serviceCounts();
        const result = await client.rpc("phase1_list_profiling_cycles", { p_barangay_id: ALPHA }, { accessToken: await authenticate("pending") });
        expectDenied(result, "pending account", ["42501"]); await expectNoSideEffect(before, "pending account");
      },
      "inactive-auth-denied": async () => {
        const before = await serviceCounts();
        const result = await client.rpc("phase1_list_profiling_cycles", { p_barangay_id: ALPHA }, { accessToken: await authenticate("inactive") });
        expectDenied(result, "inactive account", ["42501"]); await expectNoSideEffect(before, "inactive account");
      },
      "suspended-auth-denied": async () => {
        const before = await serviceCounts();
        const result = await client.rpc("phase1_list_profiling_cycles", { p_barangay_id: ALPHA }, { accessToken: await authenticate("suspended") });
        expectDenied(result, "suspended account", ["42501"]); await expectNoSideEffect(before, "suspended account");
      },
    };
    assert.deepEqual(Object.keys(jwtExecutors).sort(), registry.jwtCases.map((item) => item.id).sort(), "JWT executor registry drift");
    for (const item of registry.jwtCases) { await jwtExecutors[item.id](); pass(); }

    const ordinaryRoles = ["admin", "director", "associate", "researcher", "finance", "captain-alpha", "secretary-alpha", "mother-alpha", "volunteer"];
    for (const role of ordinaryRoles) {
      const accessToken = await authenticate(role);
      const directCases = [
        ["GET", "profiling_households?select=id&limit=1", undefined],
        ["POST", "profiling_households", { barangay_id: ALPHA, sitio_id: NORTH, household_code: "FORBIDDEN" }],
        ["PATCH", "profiling_households?id=eq.f2700000-0000-4000-8000-000000000001", { lifecycle_status: "moved" }],
        ["DELETE", "profiling_households?id=eq.f2700000-0000-4000-8000-000000000001", undefined],
      ];
      for (const [method, path, body] of directCases) {
        const before = await serviceCounts();
        const result = await client.postgrest(path, { method, accessToken, body });
        assert.ok(isDenied(result) || (method === "GET" && result.ok && Array.isArray(result.data) && result.data.length === 0), `${role} ${method} bypassed RPC-only profiling tables`);
        await expectNoSideEffect(before, `${role} ${method} direct profiling access`); pass();
      }
    }

    const mother = await authenticate("mother-alpha");
    const abuse = new Map();
    const createAttempt = async (mutator, overrides = {}) => {
      const payload = validPayload(overrides);
      mutator(payload);
      return client.rpc("phase1_create_profiling_submission", {
        p_cycle_id: overrides.cycleId ?? COLLECTING,
        p_sitio_id: overrides.sitioId ?? NORTH,
        p_payload: payload, p_source_type: "manual", p_import_batch_id: null,
      }, { accessToken: mother });
    };
    abuse.set("unknown-key", () => createAttempt((p) => { p.unknown_key = "rejected"; }));
    abuse.set("protected-key", () => createAttempt((p) => { p.created_by = PASSWORD_USERS[7][1]; }));
    abuse.set("wrong-json-type", () => createAttempt((p) => { p.residents = {}; }));
    abuse.set("prohibited-synonym", () => createAttempt((p) => { p.residents[0].national_id = "PII-CANARY"; }));
    abuse.set("pii-category-canary", () => createAttempt((p) => { p.household.needs = ["PII-CANARY-PERSON"]; }));
    abuse.set("minor-consent-contradiction", () => createAttempt((p) => { p.residents[0].estimated_age = 10; }));
    abuse.set("guardian-consent-contradiction", () => createAttempt((p) => { p.residents[0].guardian_name = "Synthetic Guardian"; p.residents[0].guardian_relationship = "parent"; }));
    abuse.set("invalid-pregnancy-period", () => createAttempt((p) => { p.residents[0].pregnancy_status = true; }));
    abuse.set("cross-cycle-id", () => createAttempt((p) => { p.cycle_id = COMPLETED; }));
    abuse.set("cross-sample-id", () => createAttempt((p) => { p.sample_reference = "SMP-NOTREGISTERED"; p.household_row_key = p.sample_reference; p.residents[0].household_row_key = p.sample_reference; }));
    abuse.set("cross-sitio-id", () => createAttempt((p) => { p.household.sitio_id = SOUTH; }));
    abuse.set("cross-resident-id", () => createAttempt((p) => { p.residents[0].resident_id = "f2720000-0000-4000-8000-000000000001"; }));
    abuse.set("stale-version", () => createAttempt((p) => { p.expected_version = 999; }, { cycleId: COMPLETED, sampleReference: "SMP-SYNDONE01", residentId: "f2720000-0000-4000-8000-000000000001", age: 36 }));
    abuse.set("malformed-import", () => client.rpc("phase1_stage_profiling_import_v2", {
      p_cycle_id: COLLECTING, p_sitio_id: NORTH, p_source_type: "csv", p_file_hash: "a".repeat(64), p_template_version: "phase1.synthetic.v1", p_packages: {}, p_errors: [], p_replaces_batch_id: null,
    }, { accessToken: mother }));
    abuse.set("altered-hash", () => client.rpc("phase1_stage_profiling_import_v2", {
      p_cycle_id: COLLECTING, p_sitio_id: NORTH, p_source_type: "csv", p_file_hash: "altered", p_template_version: "phase1.synthetic.v1", p_packages: [], p_errors: [], p_replaces_batch_id: null,
    }, { accessToken: mother }));
    abuse.set("forged-total", () => createAttempt((p) => { p.household.anonymous_nonparticipant_count = 101; }));
    assert.deepEqual([...abuse.keys()].sort(), [...registry.rpcAbuseCases].sort(), "RPC abuse executor registry drift");
    for (const id of registry.rpcAbuseCases) {
      const before = await serviceCounts();
      const result = await abuse.get(id)();
      expectDenied(result, id, ["22023", "23505", "23514", "42501", "40001"]);
      await expectNoSideEffect(before, id); pass();
    }

    const researcher = await authenticate("researcher");
    const secretary = await authenticate("secretary-alpha");
    const registered = await client.rpc("phase1_register_sample_units", {
      p_cycle_id: DRAFT,
      p_units: ["SMP-RACECODE01", "SMP-RACECODE02", "SMP-RACECODE03"].map((sample_reference) => ({ sample_reference, sitio_id: NORTH })),
    }, { accessToken: researcher });
    expectOk(registered, "race sample registration");
    const collecting = await client.rpc("phase1_transition_profiling_cycle", {
      p_cycle_id: DRAFT, p_expected_version: 1, p_to_status: "collecting", p_reason: "Synthetic concurrency setup",
    }, { accessToken: researcher });
    expectOk(collecting, "race cycle collecting transition");

    let before = await serviceCounts();
    const codeRace = await race("code-allocation", ["SMP-RACECODE01", "SMP-RACECODE02"].map((sampleReference) => () => client.rpc("phase1_create_profiling_submission", {
      p_cycle_id: DRAFT, p_sitio_id: NORTH, p_payload: validPayload({ cycleId: DRAFT, sampleReference }), p_source_type: "manual", p_import_batch_id: null,
    }, { accessToken: mother })), 2, []);
    let after = await serviceCounts();
    assert.equal(after.profiling_households - before.profiling_households, 2, "code allocation did not create two households");
    assert.equal(after.profiling_residents - before.profiling_residents, 2, "code allocation did not create two residents");
    assert.equal(after.profiling_submissions - before.profiling_submissions, 2, "code allocation did not create two submissions");
    assert.equal(after.profiling_events - before.profiling_events, 2, "code allocation did not create two immutable events");
    const createdIds = codeRace.winners.map((result) => result.data);
    assert.equal(new Set(createdIds).size, 2, "code allocation returned duplicate submission IDs");
    const listed = await client.rpc("phase1_list_profiling_submissions", { p_cycle_id: DRAFT }, { accessToken: mother });
    expectOk(listed, "code allocation submission list");
    const createdRows = listed.data.filter((row) => createdIds.includes(row.id));
    assert.equal(createdRows.length, 2);
    assert.equal(new Set(createdRows.map((row) => row.household_code)).size, 2, "code allocation generated duplicate household codes");
    pass();

    const third = await client.rpc("phase1_create_profiling_submission", {
      p_cycle_id: DRAFT, p_sitio_id: NORTH, p_payload: validPayload({ cycleId: DRAFT, sampleReference: "SMP-RACECODE03" }), p_source_type: "manual", p_import_batch_id: null,
    }, { accessToken: mother });
    expectOk(third, "create-versus-submit setup");
    before = await serviceCounts();
    await race("create-versus-submit", [
      () => client.rpc("phase1_create_profiling_submission", {
        p_cycle_id: DRAFT, p_sitio_id: NORTH, p_payload: validPayload({ cycleId: DRAFT, sampleReference: "SMP-RACECODE03" }), p_source_type: "manual", p_import_batch_id: null,
      }, { accessToken: mother }),
      () => client.rpc("phase1_submit_profiling_package", { p_submission_id: third.data, p_expected_version: 1 }, { accessToken: mother }),
    ]);
    after = await serviceCounts();
    assert.equal(after.profiling_submissions, before.profiling_submissions, "create-versus-submit left an extra package");
    assert.equal(after.profiling_events - before.profiling_events, 1, "create-versus-submit did not append exactly one winning event");
    pass();

    before = await serviceCounts();
    await race("approve-versus-return", [
      () => client.rpc("phase1_decide_profiling_submission", { p_submission_id: "f2730000-0000-4000-8000-000000000003", p_expected_version: 1, p_decision: "approve", p_reason: null }, { accessToken: secretary }),
      () => client.rpc("phase1_decide_profiling_submission", { p_submission_id: "f2730000-0000-4000-8000-000000000003", p_expected_version: 1, p_decision: "return", p_reason: "Synthetic concurrent return" }, { accessToken: secretary }),
    ]);
    after = await serviceCounts();
    assert.equal(after.profiling_events - before.profiling_events, 1, "approve-versus-return appended the wrong event count");
    pass();

    before = await serviceCounts();
    await race("duplicate-versus-commit", [
      () => client.rpc("phase1_resolve_profiling_duplicate_v2", { p_candidate_id: "f27b0000-0000-4000-8000-000000000001", p_resolution: "exclude", p_reason: "Synthetic duplicate exclusion", p_linked_entity_id: null }, { accessToken: secretary }),
      () => client.rpc("phase1_commit_profiling_import", { p_batch_id: "f2780000-0000-4000-8000-000000000001" }, { accessToken: mother }),
    ], 1, ["23514", "40001"]);
    after = await serviceCounts();
    assert.equal(after.profiling_events - before.profiling_events, 1, "duplicate-versus-commit appended the wrong event count");
    assert.equal(after.profiling_submissions, before.profiling_submissions, "duplicate-versus-commit partially committed a package");
    pass();

    const revisionPayload = validPayload({ cycleId: VALIDATING, sampleReference: "SMP-SYNREVISE1", residentId: "f2720000-0000-4000-8000-000000000010", age: 33 });
    before = await serviceCounts();
    await race("revision-race", [1, 2].map(() => () => client.rpc("phase1_revise_returned_profiling_submission", {
      p_submission_id: "f2730000-0000-4000-8000-000000000012", p_expected_version: 2, p_payload: revisionPayload,
    }, { accessToken: mother })));
    after = await serviceCounts();
    assert.equal(after.profiling_submissions - before.profiling_submissions, 1, "revision race did not create exactly one revision");
    assert.equal(after.profiling_events - before.profiling_events, 1, "revision race did not append exactly one event");
    pass();

    const lifecycleRace = async ({ id, action, entityId, targetId = null }) => {
      const lifecycleBefore = await serviceCounts();
      await race(id, [1, 2].map(() => () => client.rpc("phase1_apply_profile_lifecycle_action", {
        p_action: action, p_entity_id: entityId, p_expected_version: 1, p_effective_on: "2026-05-01", p_reason: `Synthetic ${id}`, p_target_entity_id: targetId,
      }, { accessToken: researcher })));
      const lifecycleAfter = await serviceCounts();
      assert.equal(lifecycleAfter.profiling_lifecycle_events - lifecycleBefore.profiling_lifecycle_events, 1, `${id} did not append exactly one lifecycle event`);
      pass();
    };
    await lifecycleRace({ id: "resident-transfer", action: "resident_transfer", entityId: "f2720000-0000-4000-8000-000000000004", targetId: "f2700000-0000-4000-8000-000000000007" });
    await lifecycleRace({ id: "resident-death", action: "resident_deceased", entityId: "f2720000-0000-4000-8000-000000000006" });
    await lifecycleRace({ id: "resident-merge", action: "resident_merge", entityId: "f2720000-0000-4000-8000-000000000007", targetId: "f2720000-0000-4000-8000-000000000008" });

    before = await serviceCounts();
    await race("consent-withdrawal", [1, 2].map(() => () => client.rpc("phase1_apply_profile_lifecycle_action", {
      p_action: "consent_withdrawal", p_entity_id: "f2720000-0000-4000-8000-000000000009", p_expected_version: 1, p_effective_on: "2026-05-01", p_reason: "Synthetic withdrawal race", p_target_entity_id: null,
    }, { accessToken: researcher })));
    await race("consent-regrant", [1, 2].map(() => () => client.rpc("phase1_record_resident_reconsent", {
      p_resident_id: "f2720000-0000-4000-8000-000000000009", p_expected_version: 2, p_effective_on: "2026-06-01", p_consented_by_name: "Synthetic Consent Race", p_guardian_relationship: null,
    }, { accessToken: researcher })));
    after = await serviceCounts();
    assert.equal(after.profiling_lifecycle_events - before.profiling_lifecycle_events, 2, "withdraw/regrant did not append exactly two lifecycle events");
    pass();

    const completionCycle = await client.rpc("phase1_create_profiling_cycle", {
      p_barangay_id: ALPHA, p_name: "Synthetic Completion Race", p_sample_method: "synthetic", p_target_households: 1,
      p_collection_starts_on: "2026-07-01", p_collection_ends_on: "2026-07-31", p_privacy_notice_id: NOTICE,
    }, { accessToken: researcher });
    expectOk(completionCycle, "completion race cycle create");
    expectOk(await client.rpc("phase1_register_sample_units", {
      p_cycle_id: completionCycle.data,
      p_units: [{ sample_reference: "SMP-RACECOMP01", sitio_id: NORTH }],
    }, { accessToken: researcher }), "completion race sample registration");
    expectOk(await client.rpc("phase1_transition_profiling_cycle", { p_cycle_id: completionCycle.data, p_expected_version: 1, p_to_status: "collecting", p_reason: "Synthetic race setup" }, { accessToken: researcher }), "completion race collecting");
    expectOk(await client.rpc("phase1_record_sample_outcome", {
      p_cycle_id: completionCycle.data, p_sitio_id: NORTH, p_sample_reference: "SMP-RACECOMP01", p_contact_outcome: "unavailable", p_anonymous_household_size: null,
    }, { accessToken: mother }), "completion race resolved sample outcome");
    expectOk(await client.rpc("phase1_transition_profiling_cycle", { p_cycle_id: completionCycle.data, p_expected_version: 2, p_to_status: "validating", p_reason: "Synthetic race setup" }, { accessToken: researcher }), "completion race validating");
    before = await serviceCounts();
    await race("cycle-completion", [1, 2].map(() => () => client.rpc("phase1_transition_profiling_cycle", {
      p_cycle_id: completionCycle.data, p_expected_version: 3, p_to_status: "completed", p_reason: "Synthetic completion race",
    }, { accessToken: researcher })));
    after = await serviceCounts();
    assert.equal(after.profiling_events - before.profiling_events, 1, "cycle completion did not append exactly one transition event");
    pass();

    assert.deepEqual(registry.concurrencyCases.slice().sort(), ["code-allocation", "create-versus-submit", "approve-versus-return", "duplicate-versus-commit", "revision-race", "resident-transfer", "resident-death", "resident-merge", "consent-withdraw-regrant", "cycle-completion"].sort(), "concurrency executor registry drift");

    const volunteer = await authenticate("volunteer");
    const captain = await authenticate("captain-alpha");
    const storageExecutors = new Map([
      ["anonymous-list", () => client.storageList("reports", "synthetic/")],
      ["unauthorized-read", () => client.storage("reports", "synthetic/private.pdf", { method: "GET", accessToken: volunteer })],
      ["unauthorized-upload", () => client.storage("reports", "synthetic/upload.pdf", { method: "POST", accessToken: volunteer, body: "synthetic" })],
      ["unauthorized-update", () => client.storage("reports", "synthetic/private.pdf", { method: "PUT", accessToken: volunteer, body: "synthetic" })],
      ["unauthorized-delete", () => client.storage("reports", "synthetic/private.pdf", { method: "DELETE", accessToken: volunteer })],
      ["cross-parent", () => client.storage("reports", "other-parent/private.pdf", { method: "GET", accessToken: captain })],
      ["cross-barangay", () => client.storage("activity-photos", "synthetic-beta/private.jpg", { method: "GET", accessToken: captain })],
      ["caller-path", () => client.storage("reports", "caller-selected/object.pdf", { method: "POST", accessToken: mother, body: "synthetic" })],
      ["traversal", async () => {
        assert.throws(() => client.storage("reports", "../escape.pdf", { method: "GET", accessToken: volunteer }), /request path is invalid/);
        return { ok: false, status: 400, data: { code: "CLIENT_PATH_REJECTED" } };
      }],
      ["oversize", () => client.storage("reports", "synthetic/oversize.pdf", { method: "POST", accessToken: volunteer, body: "x".repeat(10 * 1024 * 1024 + 1) })],
      ["mime-spoof", () => client.storage("reports", "synthetic/spoof.pdf", { method: "POST", accessToken: volunteer, body: "FFD8-SYNTHETIC-JPEG", headers: { "content-type": "application/pdf" } })],
      ["quarantine-download", () => client.storage("reports", "quarantine/synthetic.pdf", { method: "GET", accessToken: captain })],
      ["signed-url-expiry", () => client.storageSign("reports", "synthetic/private.pdf", 301, { accessToken: captain })],
      ["audited-download", () => client.storage("reports", "synthetic/audited.pdf", { method: "GET", accessToken: captain })],
      ["orphan-compensation", () => client.storage("activity-photos", "synthetic/orphan.jpg", { method: "POST", accessToken: volunteer, body: "synthetic" })],
    ]);
    assert.deepEqual([...storageExecutors.keys()].sort(), registry.storageCases.slice().sort(), "Storage executor registry drift");
    for (const id of registry.storageCases) {
      const storageBefore = await serviceCounts();
      const result = await storageExecutors.get(id)();
      if (id === "anonymous-list" && result.ok) {
        assert.ok(Array.isArray(result.data) && result.data.length === 0, "anonymous Storage list disclosed object metadata");
      } else {
        assert.ok(!result.ok && result.status >= 400 && result.status < 500, `${id} Storage boundary was not denied (${result.status})`);
      }
      const storageAfter = await serviceCounts();
      assert.equal(storageAfter.storage_objects, storageBefore.storage_objects, `${id} left a Storage object`);
      assert.equal(storageAfter.audit_logs, storageBefore.audit_logs, `${id} wrote an unexpected audit event`);
      pass();
    }

    const completedAggregate = await client.rpc("phase1_profiling_aggregate", { p_cycle_id: COMPLETED }, { accessToken: researcher });
    expectOk(completedAggregate, "completed-cycle aggregate reconciliation"); pass();
    assertStrictAggregate(completedAggregate.data); pass();
    assert.deepEqual(completedAggregate.data.sample, {
      method: "systematic", targetHouseholds: 1, registeredHouseholds: 1,
      participatingHouseholds: 1, nonparticipatingHouseholds: 0,
      approvedHouseholds: 1, approvedResidents: 2,
      coveragePercent: 100, responseRatePercent: 100,
    }, "completed-cycle sample reconciliation drifted"); pass();
    assert.equal(completedAggregate.data.official.verified, true);
    assert.ok(completedAggregate.data.official.asOfDate <= completedAggregate.data.cycle.reportingDate, "aggregate used a future official snapshot"); pass();
    assert.ok(completedAggregate.data.cells.every((cell) => cell.count.suppressed || cell.count.value === 0 || cell.count.value >= completedAggregate.data.privacy.suppressionThreshold), "aggregate exposed a small cell"); pass();
    const serializedAggregate = JSON.stringify(completedAggregate.data).toLowerCase();
    for (const forbidden of ["first_name", "last_name", "birth_date", "contact_number", "landmark", "resident_code", "household_code", "synthetic adult", "synthetic minor"]) {
      assert.ok(!serializedAggregate.includes(forbidden), `aggregate leaked prohibited resident material: ${forbidden}`);
    }
    pass();
    rollbackBaseline = await serviceCounts();
  } finally {
    const off = await client.rpc("phase1_set_profiling_runtime", {
      p_mode: "off", p_synthetic_user_ids: [], p_synthetic_barangay_ids: [], p_privacy_approved: false,
    }, { accessToken: director });
    assert.ok(off.ok && off.data?.mode === "off", "disposable profiling mode did not return to off");
  }

  const offRuntime = await client.rpc("phase1_get_profiling_runtime", {}, { accessToken: director });
  assert.ok(offRuntime.ok && offRuntime.data?.mode === "off", "profiling runtime did not report off after rollback"); pass();
  const offAggregate = await client.rpc("phase1_profiling_aggregate", { p_cycle_id: COMPLETED }, { accessToken: await authenticate("researcher") });
  expectDenied(offAggregate, "aggregate read while profiling is off", ["55000"]); pass();
  assert.deepEqual(await serviceCounts(), rollbackBaseline, "rollback changed governed history"); pass();
  const offDirectWrite = await client.postgrest("profiling_households", {
    method: "POST", accessToken: await authenticate("researcher"),
    body: { barangay_id: ALPHA, sitio_id: NORTH, household_code: "ROLLBACK-BYPASS" },
  });
  expectDenied(offDirectWrite, "direct profiling write after rollback");
  assert.deepEqual(await serviceCounts(), rollbackBaseline, "direct rollback bypass changed governed history"); pass();
  const offStorage = await client.storage("reports", "rollback/bypass.pdf", { method: "POST", accessToken: await authenticate("volunteer"), body: "synthetic" });
  assert.ok(!offStorage.ok && offStorage.status >= 400 && offStorage.status < 500, "Storage write bypassed rollback boundary");
  assert.deepEqual(await serviceCounts(), rollbackBaseline, "Storage rollback bypass changed governed history"); pass();

  const expected = phase1HttpGateContract();
  assert.equal(passed, expected.jwtCases + expected.rpcAbuseCases + expected.directTableCases + expected.concurrencyCases + expected.storageCases + expected.reconciliationCases + expected.rollbackCases);
  return { schema: expected.schema, passed, failed: 0, skipped: 0, finalState: expected.finalState };
}
