import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createReleaseGateHttpClient, runSynchronizedRace } from "./lib/release-gate-http.mjs";

const PASSWORD = "SyntheticReleaseGateOnly!2026";
const ALPHA = "f2100000-0000-4000-8000-000000000001";
const NORTH = "f2300000-0000-4000-8000-000000000001";
const DIRECTOR_ID = "f2200000-0000-4000-8000-000000000002";
const ASSOCIATE_ID = "f2200000-0000-4000-8000-000000000003";
const PARTNER = "f3100000-0000-4000-8000-000000000001";
const LIVE_PARTNER = "f3100000-0000-4000-8000-000000000006";
const PARTNER_ROOTS = [
  "f3100000-0000-4000-8000-000000000001", "f3100000-0000-4000-8000-000000000002",
  "f3100000-0000-4000-8000-000000000003", "f3100000-0000-4000-8000-000000000004",
  "f3100000-0000-4000-8000-000000000005", "f3100000-0000-4000-8000-000000000007",
  "f3100000-0000-4000-8000-000000000008", "f3100000-0000-4000-8000-000000000009",
  "f3100000-0000-4000-8000-00000000000a", "f3100000-0000-4000-8000-00000000000b",
  "f3100000-0000-4000-8000-00000000000c",
];
const HISTORY_ROOTS = ["f3200000-0000-4000-8000-000000000001", "f3200000-0000-4000-8000-000000000002"];
const PROPOSAL = "f3310000-0000-4000-8000-000000000001";
const PROGRAM = "f3320000-0000-4000-8000-000000000001";
const ACTIVE_SYNTHETIC_IDS = [
  ...Array.from({ length: 9 }, (_, index) => `f2200000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  ...Array.from({ length: 14 }, (_, index) => `f2200000-0000-4000-8000-${String(index + 13).padStart(12, "0")}`),
];
const ACCOUNT_NAMES = [
  "admin", "director", "associate", "researcher", "finance", "captain-alpha", "secretary-alpha", "mother-alpha", "volunteer",
  "pending", "suspended", "inactive", "office-history", "organization-history", "department-history",
  "deny-partnerships", "deny-proposals", "deny-budgets",
];

function isoDate(offsetDays = 0) {
  const date = new Date(); date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function sqlState(result) { return typeof result.data?.code === "string" ? result.data.code : null; }
function denied(result) { return !result.ok && result.status >= 400 && result.status < 500; }

function proposalPayload(title, overrides = {}) {
  return {
    title, description: "Structured synthetic proposal for executable Phase 2 gate testing.",
    origin_channel: "paraya_internal", originating_partner_id: null, responsible_officer_id: ASSOCIATE_ID,
    project_category_id: "f3330000-0000-4000-8000-000000000001", starts_on: "2026-10-01", ends_on: "2026-10-15",
    targets: [{ barangay_id: ALPHA, sitio_id: NORTH, is_lead: true }],
    needs: [{ need_id: "f3300000-0000-4000-8000-000000000001", target_area_key: `${ALPHA}:${NORTH}`, intended_coverage: "partial", planned_beneficiary_count: 12, planned_beneficiary_percentage: null, notes: "Synthetic partial coverage" }],
    beneficiary_category_codes: ["synthetic_households"], final_beneficiary_count: 12,
    beneficiary_source_description: "Reviewed synthetic manual planning register.",
    beneficiary_estimates: [{ category_code: "synthetic_households", target_area_key: `${ALPHA}:${NORTH}`, evidence_snapshot_id: null, final_count: 12, manual_source_description: "Reviewed synthetic manual planning register.", override_reason: null }],
    sdg_numbers: [4, 17], zero_cash: false, zero_cash_justification: null,
    budget_items: [{ category_id: "f3340000-0000-4000-8000-000000000001", item_kind: "cash", description: "Synthetic gate materials", quantity: "10.000", unit: "kit", unit_cost: "100.00", in_kind_valuation: null, notes: null, sort_order: 1 }],
    funding_sources: [{ source_type: "internal_dyci", source_state: "expected", partner_id: null, cash_value: "1000.00", in_kind_value: "0.00", notes: null }],
    ...overrides,
  };
}

function historicalPayload(title, overrides = {}) {
  return {
    title, summary: "Aggregate synthetic historical record.", category: "education", date_precision: "year",
    starts_on: "2024-01-01", ends_on: null, beneficiary_count: 10, volunteer_count: 4,
    volunteer_hours: "12.00", budget_total: "500.00", currency: "PHP", resources: "Synthetic aggregate resources",
    historical_need_description: "Synthetic aggregate learning need", outcomes: "Synthetic aggregate outcome",
    follow_up: "Synthetic follow-up", source_type: "paper", source_notes: "Reviewed synthetic source inventory",
    partner_ids: [PARTNER], barangay_ids: [ALPHA], need_ids: [], sdgs: [{ number: 4, source: "documented" }],
    ...overrides,
  };
}

export function phase2HttpGateContract(registry) {
  const groups = ["jwtCases", "rpcAbuseCases", "directTableCases", "concurrencyCases", "storageCases", "reconciliationCases", "rollbackCases"];
  return {
    schema: "agape.phase2-http-gates.v1",
    cases: groups.reduce((sum, key) => sum + registry[key].length, 0),
    finalState: { phase2Modes: "off", partnerMutationAuthority: "v1", proposalMutationAuthority: "v1" },
  };
}

export async function runPhase2HttpGates({ apiUrl, anonKey, serviceRoleKey, readCounts, expectedPort = 54321 }) {
  assert.equal(typeof readCounts, "function", "a fixed Phase 2 count reader is required");
  assert.ok(typeof serviceRoleKey === "string" && serviceRoleKey.length >= 20, "local service role key is unavailable");
  const registry = JSON.parse(await readFile(resolve(import.meta.dirname, "..", "test", "gates", "phase2-security-scenarios.json"), "utf8"));
  const contract = phase2HttpGateContract(registry);
  const client = createReleaseGateHttpClient({ apiUrl, anonKey, expectedPort });
  const tokens = new Map(); const passed = new Set();
  const pass = (id, group) => { assert.ok(registry[group].includes(id), `unregistered ${group} case ${id}`); assert.ok(!passed.has(`${group}:${id}`), `duplicate case ${id}`); passed.add(`${group}:${id}`); };
  const token = async (name) => {
    if (!tokens.has(name)) tokens.set(name, (await client.signInWithPassword(`${name}@release-gate.invalid`, PASSWORD)).accessToken);
    return tokens.get(name);
  };
  const expectOk = (result, label) => assert.ok(result.ok, `${label} failed (${result.status}/${sqlState(result) ?? "none"}/${result.data?.message ?? "no-message"})`);
  const expectDenied = (result, label, states = []) => {
    const databaseException = !result.ok && result.status >= 400 && result.status < 600 && states.includes(sqlState(result));
    assert.ok(denied(result) || databaseException, `${label} was not denied (${result.status})`);
    if (states.length) assert.ok(states.includes(sqlState(result)), `${label} returned ${sqlState(result) ?? "no SQLSTATE"}`);
  };
  const counts = async () => {
    const value = await readCounts();
    assert.ok(value && typeof value === "object" && !Array.isArray(value));
    assert.ok(Object.values(value).every((item) => Number.isInteger(item) && item >= 0), "Phase 2 count reader returned invalid counts");
    return value;
  };
  const noCountChange = async (before, label) => assert.deepEqual(await counts(), before, `${label} changed governed row counts`);
  const directNoMutation = async (table, method, accessToken, body, targetId) => {
    const before = await counts();
    const suffix = method === "POST" ? "" : `?id=eq.${targetId}`;
    const result = await client.postgrest(`${table}${suffix}`, { method, accessToken, body, headers: { Prefer: "return=representation" } });
    if (method === "GET") assert.ok(!result.ok || !Array.isArray(result.data) || result.data.length === 0, `${table} direct read disclosed rows`);
    await noCountChange(before, `${table} ${method}`);
  };
  const configure = async (component, mode, entityIds = [], implementationDate = null) => {
    const result = await client.rpc("phase2_configure_component", {
      p_component: component, p_mode: mode, p_synthetic_user_ids: mode === "synthetic" ? ACTIVE_SYNTHETIC_IDS : [],
      p_synthetic_entity_ids: mode === "synthetic" ? entityIds : [], p_implementation_date: implementationDate, p_configuration: {},
    }, { accessToken: await token("director") });
    expectOk(result, `${component} ${mode} configuration`);
  };
  const raceOne = async (label, tasks, accepted = ["23505", "23514", "40001", "42501"]) => {
    const results = await runSynchronizedRace(tasks);
    assert.ok(results.every((item) => item.status === "fulfilled"), `${label} had a transport failure`);
    const values = results.map((item) => item.value); const winners = values.filter((item) => item.ok); const losers = values.filter((item) => !item.ok);
    assert.equal(winners.length, 1, `${label} expected one winner: ${values.map((item) => `${item.status}/${sqlState(item)}`).join(",")}`);
    assert.ok(losers.every((item) => accepted.includes(sqlState(item))), `${label} returned a non-conflict loser`);
    return winners[0];
  };
  const setV1 = async (component) => {
    const result = await client.rpc("phase2_set_cutover_authority", { p_component: component, p_authority: "v1", p_reconciliation_hash: "d".repeat(64) }, { accessToken: await token("director") });
    expectOk(result, `${component} V1 restore`);
  };

  for (const name of ACCOUNT_NAMES) await token(name);
  let rollbackBaseline;
  try {
    // Partner Registry
    await configure("partners", "synthetic", PARTNER_ROOTS);
    const fullPartnerReaders = ["director", "associate", "researcher"];
    for (const name of fullPartnerReaders) {
      const result = await client.rpc("phase2_list_partners", {}, { accessToken: await token(name) }); expectOk(result, `${name} partner list`);
      assert.ok(Array.isArray(result.data) && result.data.every((row) => row.id !== LIVE_PARTNER));
    }
    for (const name of ["captain-alpha", "secretary-alpha", "mother-alpha"]) {
      const result = await client.rpc("phase2_list_partners", {}, { accessToken: await token(name) }); expectOk(result, `${name} scoped partner list`);
      assert.ok(result.data.every((row) => row.barangay_id === ALPHA), `${name} crossed barangay scope`);
    }
    for (const name of ["admin", "finance", "volunteer", "office-history", "organization-history", "department-history"]) {
      expectDenied(await client.rpc("phase2_list_partners", {}, { accessToken: await token(name) }), `${name} partner list`);
    }
    pass("partner-role-matrix", "jwtCases");
    for (const name of ["pending", "inactive", "suspended"]) expectDenied(await client.rpc("phase2_list_partners", {}, { accessToken: await token(name) }), `${name} partner state`);
    pass("partner-state-denials", "jwtCases");
    expectDenied(await client.rpc("phase2_list_partners", {}, { accessToken: await token("deny-partnerships") }), "partnership deny override"); pass("partner-deny-override", "jwtCases");
    expectDenied(await client.rpc("phase2_get_partner", { p_partner_id: LIVE_PARTNER }, { accessToken: await token("director") }), "live Partner canary"); pass("partner-live-isolation", "jwtCases");

    const partnerAbuseBefore = await counts();
    expectDenied(await client.rpc("phase2_create_partner", { p_payload: { name: "Synthetic rejected", entity_type: "other", classification: "external", roles: ["partner"], barangay_id: null, unexpected: true } }, { accessToken: await token("associate") }), "unknown Partner field", ["22023"]); await noCountChange(partnerAbuseBefore, "unknown Partner field"); pass("partner-unknown-field", "rpcAbuseCases");
    expectDenied(await client.rpc("phase2_get_partner", { p_partner_id: LIVE_PARTNER }, { accessToken: await token("associate") }), "live Partner target"); pass("partner-live-target", "rpcAbuseCases");
    expectDenied(await client.rpc("phase2_update_partner", { p_partner_id: PARTNER, p_expected_version: 999, p_payload: { name: "stale" } }, { accessToken: await token("associate") }), "stale Partner", ["40001"]); pass("partner-stale-version", "rpcAbuseCases");
    expectDenied(await client.rpc("phase2_add_partner_contact", { p_partner_id: PARTNER, p_payload: { full_name: "Missing Consent", preferred_channel: "email", email: "missing@release-gate.invalid", phone: null, title: null, is_primary: false, status_email_opt_in: true, consent_source: null, consent_at: null, active_from: isoDate(), active_until: null } }, { accessToken: await token("associate") }), "contact opt-in without consent", ["23514"]); pass("contact-opt-in-without-consent", "rpcAbuseCases");

    const directPartnerToken = await token("director");
    for (const [id, method] of [["partner-read", "GET"], ["partner-insert", "POST"], ["partner-update", "PATCH"], ["partner-delete", "DELETE"]]) {
      await directNoMutation("partner_entities", method, directPartnerToken, method === "POST" ? { name: "Direct", entity_type: "other", classification: "external", data_mode: "synthetic" } : method === "PATCH" ? { name: "Direct" } : undefined, PARTNER); pass(id, "directTableCases");
    }

    const contactEventBefore = (await counts()).partnership_events;
    await raceOne("primary contact", [1, 2].map(() => () => client.rpc("phase2_update_partner_contact", {
      p_partner_id: PARTNER, p_contact_id: "f3110000-0000-4000-8000-000000000002", p_expected_version: 1,
      p_payload: { is_primary: true, active_until: null },
    }, { accessToken: tokens.get("associate") })));
    assert.equal((await counts()).partnership_events - contactEventBefore, 1); pass("primary-contact", "concurrencyCases");

    const renewalPayload = { starts_on: isoDate(), expires_on: isoDate(30), responsible_officer_id: ASSOCIATE_ID, agreement_document_id: null, agreement_exception_reason: "Synthetic release-gate exception", agreement_exception_due_on: isoDate(7) };
    const renewalEventBefore = (await counts()).partnership_events;
    await raceOne("renewal", [1, 2].map(() => () => client.rpc("phase2_renew_partnership_term", { p_partner_id: PARTNER, p_expected_term_version: 1, p_payload: renewalPayload }, { accessToken: tokens.get("director") })));
    assert.equal((await counts()).partnership_events - renewalEventBefore, 1); pass("renewal", "concurrencyCases");

    const approvedMapping = await client.rpc("phase2_reconcile_legacy_partner_mapping_v2", {
      p_legacy_user_id: "f2200000-0000-4000-8000-000000000013", p_partner_id: "f3100000-0000-4000-8000-000000000008",
      p_responsible_officer_id: ASSOCIATE_ID, p_expected_version: 2, p_action: "approve", p_notes: "Synthetic mapping approval",
    }, { accessToken: tokens.get("director") }); expectOk(approvedMapping, "mapping approval");
    await raceOne("mapping sign-off", [1, 2].map(() => () => client.rpc("phase2_reconcile_legacy_partner_mapping_v2", {
      p_legacy_user_id: "f2200000-0000-4000-8000-000000000013", p_partner_id: "f3100000-0000-4000-8000-000000000008",
      p_responsible_officer_id: ASSOCIATE_ID, p_expected_version: 3, p_action: "sign_off", p_notes: "Synthetic mapping sign off",
    }, { accessToken: tokens.get("director") }))); pass("mapping-signoff", "concurrencyCases");

    const reminderResults = await runSynchronizedRace([1, 2].map(() => () => client.rpc("phase2_generate_renewal_reminders", {}, { accessToken: serviceRoleKey })));
    const reminderSummary = reminderResults.map((item) => item.status === "fulfilled"
      ? `${item.value.status}/${sqlState(item.value) ?? "none"}/${item.value.data?.message ?? "no-message"}`
      : `transport/${item.reason instanceof Error ? item.reason.message : String(item.reason)}`).join(",");
    assert.ok(reminderResults.every((item) => item.status === "fulfilled" && item.value.ok), `reminder generation race failed: ${reminderSummary}`);
    assert.ok(reminderResults.reduce((sum, item) => sum + Number(item.value.data ?? 0), 0) >= 2, "reminder race created no due reminders"); pass("reminder-generation", "concurrencyCases");
    await configure("partners", "off");

    // Historical Programs
    await configure("historical_programs", "synthetic", HISTORY_ROOTS, "2026-01-01");
    for (const name of ["director", "associate", "researcher"]) expectOk(await client.rpc("phase2_list_historical_programs", {}, { accessToken: await token(name) }), `${name} historical list`);
    for (const name of ["admin", "finance", "volunteer", "mother-alpha"]) expectDenied(await client.rpc("phase2_get_historical_analytics", {}, { accessToken: await token(name) }), `${name} historical analytics`);
    pass("historical-role-matrix", "jwtCases");
    for (const name of ["captain-alpha", "secretary-alpha"]) {
      const result = await client.rpc("phase2_get_historical_analytics", {}, { accessToken: await token(name) }); expectOk(result, `${name} historical aggregate`);
      assert.equal(result.data.scope, "own_barangay"); assert.equal(result.data.barangayId, ALPHA);
    }
    pass("historical-barangay-aggregate", "jwtCases");
    expectDenied(await client.rpc("phase2_get_historical_program", { p_id: "f3200000-0000-4000-8000-000000000003" }, { accessToken: tokens.get("researcher") }), "live history canary"); pass("historical-live-isolation", "jwtCases");

    expectDenied(await client.rpc("phase2_create_historical_program", { p_payload: historicalPayload("Rejected unknown history", { unknown: true }) }, { accessToken: tokens.get("researcher") }), "historical unknown field", ["22023"]); pass("historical-unknown-field", "rpcAbuseCases");
    expectDenied(await client.rpc("phase2_create_historical_program", { p_payload: historicalPayload("Rejected PII history", { summary: "beneficiary_name Synthetic Person" }) }, { accessToken: tokens.get("researcher") }), "historical PII canary", ["22023"]); pass("historical-pii-canary", "rpcAbuseCases");
    expectDenied(await client.rpc("phase2_get_historical_program", { p_id: "f3200000-0000-4000-8000-000000000003" }, { accessToken: tokens.get("researcher") }), "live historical target"); pass("historical-live-target", "rpcAbuseCases");
    expectDenied(await client.rpc("phase2_stage_historical_import", { p_file_hash: "bad", p_template_version: "bad", p_rows: [], p_replaces_batch_id: null }, { accessToken: tokens.get("researcher") }), "malformed historical import", ["22023"]); pass("historical-malformed-import", "rpcAbuseCases");
    for (const [id, method] of [["history-read", "GET"], ["history-insert", "POST"], ["history-update", "PATCH"], ["history-delete", "DELETE"]]) {
      await directNoMutation("historical_programs", method, tokens.get("researcher"), method === "POST" ? { title: "Direct history", category: "other", date_precision: "unknown", source_type: "other", data_mode: "synthetic" } : method === "PATCH" ? { title: "Direct" } : undefined, HISTORY_ROOTS[0]); pass(id, "directTableCases");
    }
    const importData = historicalPayload("Synthetic unique import gate");
    const staged = await client.rpc("phase2_stage_historical_import", { p_file_hash: "a".repeat(64), p_template_version: "agape.historical-programs.v2.1", p_rows: [{ row_key: "GATE-ROW-1", data: { ...importData, partner_codes: [], barangay_codes: [], partner_ids: undefined, barangay_ids: undefined }, errors: [] }], p_replaces_batch_id: null }, { accessToken: tokens.get("researcher") });
    expectOk(staged, "historical import stage");
    const batchId = staged.data.batchId;
    const commitRace = await runSynchronizedRace([1, 2].map(() => () => client.rpc("phase2_commit_historical_import", { p_batch_id: batchId }, { accessToken: tokens.get("researcher") })));
    assert.ok(commitRace.every((item) => item.status === "fulfilled" && item.value.ok));
    assert.equal(new Set(commitRace.map((item) => item.value.data.batchId)).size, 1); pass("historical-import-commit", "concurrencyCases");
    await configure("historical_programs", "off");

    // Structured Proposals and cross-component human workflow boundaries.
    await configure("proposals", "synthetic", [PROPOSAL]);
    for (const name of ["director", "associate", "researcher", "finance"]) expectOk(await client.rpc("phase2_list_proposals", {}, { accessToken: await token(name) }), `${name} proposal list`);
    for (const name of ["admin", "captain-alpha", "secretary-alpha", "mother-alpha", "volunteer"]) expectDenied(await client.rpc("phase2_list_proposals", {}, { accessToken: await token(name) }), `${name} proposal list`);
    pass("proposal-role-matrix", "jwtCases");
    expectDenied(await client.rpc("phase2_list_proposals", {}, { accessToken: await token("deny-proposals") }), "proposal deny override"); pass("proposal-deny-override", "jwtCases");
    for (const [id, method] of [["proposal-read", "GET"], ["proposal-insert", "POST"], ["proposal-update", "PATCH"], ["proposal-delete", "DELETE"]]) {
      await directNoMutation("proposal_v2_profiles", method, tokens.get("associate"), method === "POST" ? { proposal_id: PROPOSAL, workflow_status: "draft", data_mode: "synthetic" } : method === "PATCH" ? { workflow_status: "approved" } : undefined, PROPOSAL); pass(id, "directTableCases");
    }
    expectDenied(await client.rpc("phase2_save_proposal_graph_v2", { p_proposal_id: null, p_expected_version: 0, p_payload: proposalPayload("Unknown proposal", { unexpected: true }) }, { accessToken: tokens.get("associate") }), "proposal unknown field", ["22023"]); pass("proposal-unknown-field", "rpcAbuseCases");
    expectDenied(await client.rpc("phase2_save_proposal_graph_v2", { p_proposal_id: null, p_expected_version: 0, p_payload: proposalPayload("Cross mode proposal", { origin_channel: "partner_document", originating_partner_id: LIVE_PARTNER }) }, { accessToken: tokens.get("associate") }), "cross-mode Partner", ["42501"]); pass("proposal-cross-mode-partner", "rpcAbuseCases");
    const forged = await client.rpc("phase2_save_proposal_graph_v2", { p_proposal_id: null, p_expected_version: 0, p_payload: proposalPayload("Forged total proposal", { funding_sources: [{ source_type: "internal_dyci", source_state: "expected", partner_id: null, cash_value: "999.00", in_kind_value: "0.00", notes: null }] }) }, { accessToken: tokens.get("associate") }); expectOk(forged, "forged-total draft setup");
    expectDenied(await client.rpc("phase2_apply_proposal_action_v2", { p_proposal_id: forged.data.id, p_action: "submit", p_expected_version: 1, p_remarks: null, p_warning_codes: ["manual_beneficiary_source"] }, { accessToken: tokens.get("associate") }), "forged funding total", ["23514"]); pass("proposal-forged-total", "rpcAbuseCases");
    expectDenied(await client.rpc("phase2_save_proposal_graph_v2", { p_proposal_id: PROPOSAL, p_expected_version: 999, p_payload: proposalPayload("Stale update") }, { accessToken: tokens.get("associate") }), "stale proposal", ["40001", "42501"]); pass("proposal-stale-version", "rpcAbuseCases");

    const editProposal = await client.rpc("phase2_save_proposal_graph_v2", { p_proposal_id: null, p_expected_version: 0, p_payload: proposalPayload("Edit submit race") }, { accessToken: tokens.get("associate") }); expectOk(editProposal, "edit/submit setup");
    await raceOne("proposal edit/submit", [
      () => client.rpc("phase2_save_proposal_graph_v2", { p_proposal_id: editProposal.data.id, p_expected_version: 1, p_payload: proposalPayload("Edited during submit") }, { accessToken: tokens.get("associate") }),
      () => client.rpc("phase2_apply_proposal_action_v2", { p_proposal_id: editProposal.data.id, p_action: "submit", p_expected_version: 1, p_remarks: null, p_warning_codes: ["manual_beneficiary_source"] }, { accessToken: tokens.get("associate") }),
    ]); pass("proposal-edit-submit", "concurrencyCases");

    await configure("program_finance", "synthetic", [PROGRAM]);
    const advanceToFinance = async (title) => {
      const created = await client.rpc("phase2_save_proposal_graph_v2", { p_proposal_id: null, p_expected_version: 0, p_payload: proposalPayload(title) }, { accessToken: tokens.get("associate") }); expectOk(created, `${title} create`);
      const id = created.data.id;
      for (const [actor, action, version, warnings] of [["associate", "submit", 1, ["manual_beneficiary_source"]], ["associate", "pass_pre_screening", 2, []], ["associate", "pass_pre_screening", 3, []], ["researcher", "confirm_evidence", 4, []]]) {
        expectOk(await client.rpc("phase2_apply_proposal_action_v2", { p_proposal_id: id, p_action: action, p_expected_version: version, p_remarks: null, p_warning_codes: warnings }, { accessToken: tokens.get(actor) }), `${title} ${action}`);
      }
      return id;
    };
    const financeRaceId = await advanceToFinance("Finance race proposal");
    await raceOne("Finance clear/return", ["finance_clear", "finance_return"].map((action) => () => client.rpc("phase2_apply_proposal_action_v2", { p_proposal_id: financeRaceId, p_action: action, p_expected_version: 5, p_remarks: "Synthetic Finance race", p_warning_codes: [] }, { accessToken: tokens.get("finance") }))); pass("finance-clear-return", "concurrencyCases");
    const directorRaceId = await advanceToFinance("Director race proposal");
    expectOk(await client.rpc("phase2_apply_proposal_action_v2", { p_proposal_id: directorRaceId, p_action: "finance_clear", p_expected_version: 5, p_remarks: "Synthetic Finance clearance", p_warning_codes: [] }, { accessToken: tokens.get("finance") }), "Director race Finance clear");
    await raceOne("Director approve/reject", ["director_approve", "director_reject"].map((action) => () => client.rpc("phase2_apply_proposal_action_v2", { p_proposal_id: directorRaceId, p_action: action, p_expected_version: 6, p_remarks: "Synthetic Director race", p_warning_codes: [] }, { accessToken: tokens.get("director") }))); pass("director-approve-reject", "concurrencyCases");
    const handoffRace = await runSynchronizedRace([1, 2].map(() => () => client.rpc("phase2_handoff_proposal_v2", { p_proposal_id: PROPOSAL, p_expected_version: 1 }, { accessToken: tokens.get("associate") })));
    assert.ok(handoffRace.every((item) => item.status === "fulfilled" && item.value.ok));
    assert.equal(new Set(handoffRace.map((item) => item.value.data.programId)).size, 1); pass("handoff-idempotency", "concurrencyCases");
    await configure("proposals", "off");

    // Program Finance
    for (const name of ["director", "associate", "researcher", "finance"]) expectOk(await client.rpc("phase2_get_program_finance", { p_program_id: PROGRAM }, { accessToken: await token(name) }), `${name} program finance`);
    for (const name of ["admin", "captain-alpha", "secretary-alpha", "mother-alpha", "volunteer"]) expectDenied(await client.rpc("phase2_get_program_finance", { p_program_id: PROGRAM }, { accessToken: await token(name) }), `${name} program finance`);
    pass("finance-role-matrix", "jwtCases");
    expectDenied(await client.rpc("phase2_get_program_finance", { p_program_id: PROGRAM }, { accessToken: await token("deny-budgets") }), "budget deny override"); pass("finance-deny-override", "jwtCases");
    for (const [id, method] of [["finance-read", "GET"], ["finance-insert", "POST"], ["finance-update", "PATCH"], ["finance-delete", "DELETE"]]) {
      await directNoMutation("program_expenditures", method, tokens.get("finance"), method === "POST" ? { program_id: PROGRAM, budget_item_id: "f3420000-0000-4000-8000-000000000001", amount: 1, spent_on: isoDate(), description: "Direct" } : method === "PATCH" ? { amount: 999 } : undefined, "f3440000-0000-4000-8000-000000000001"); pass(id, "directTableCases");
    }
    expectDenied(await client.rpc("phase2_record_expenditure_v2", { p_program_id: PROGRAM, p_payload: { budget_item_id: "f3390000-0000-4000-8000-000000000001", amount: "1.00", spent_on: isoDate(), payee_label: null, description: "Cross program", receipt_document_id: null, receipt_exception_reason: "Synthetic exception reason", variance_explanation: null } }, { accessToken: tokens.get("associate") }), "cross-program allocation item", ["23514"]); pass("finance-cross-program-item", "rpcAbuseCases");
    expectDenied(await client.rpc("phase2_record_expenditure_v2", { p_program_id: PROGRAM, p_payload: { budget_item_id: "f3420000-0000-4000-8000-000000000001", amount: "-1.00", spent_on: isoDate(), payee_label: null, description: "Forged negative", receipt_document_id: null, receipt_exception_reason: "Synthetic exception reason", variance_explanation: null } }, { accessToken: tokens.get("associate") }), "forged expenditure amount"); pass("finance-forged-amount", "rpcAbuseCases");
    expectDenied(await client.rpc("phase2_create_liquidation_v2", { p_program_id: PROGRAM, p_summary: { period_start: isoDate(-1), period_end: isoDate(), narrative: "Synthetic invalid liquidation", arbitrary: true }, p_expenditure_ids: ["f3440000-0000-4000-8000-000000000001"] }, { accessToken: tokens.get("associate") }), "arbitrary liquidation JSON", ["22023"]); pass("liquidation-arbitrary-json", "rpcAbuseCases");

    const recordAndVerify = async (amount, description) => {
      const recorded = await client.rpc("phase2_record_expenditure_v2", { p_program_id: PROGRAM, p_payload: { budget_item_id: "f3420000-0000-4000-8000-000000000001", amount, spent_on: isoDate(), payee_label: "Synthetic supplier", description, receipt_document_id: null, receipt_exception_reason: "Synthetic receipt exception", variance_explanation: null } }, { accessToken: tokens.get("associate") }); expectOk(recorded, `${description} record`);
      expectOk(await client.rpc("phase2_review_expenditure", { p_program_id: PROGRAM, p_id: recorded.data.id, p_action: "verify", p_expected_version: 1, p_reason: "Synthetic Finance verification" }, { accessToken: tokens.get("finance") }), `${description} verify`);
      return recorded.data.id;
    };
    const correctionId = await recordAndVerify("50.00", "Correction race expense");
    await raceOne("expenditure correct/void", [
      () => client.rpc("phase2_correct_expenditure_v2", { p_program_id: PROGRAM, p_id: correctionId, p_expected_version: 2, p_replacement_payload: { budget_item_id: "f3420000-0000-4000-8000-000000000001", amount: "60.00", spent_on: isoDate(), payee_label: "Synthetic supplier", description: "Corrected synthetic expense", receipt_document_id: null, receipt_exception_reason: "Synthetic receipt exception", variance_explanation: null }, p_reason: "Synthetic correction race" }, { accessToken: tokens.get("associate") }),
      () => client.rpc("phase2_void_expenditure", { p_program_id: PROGRAM, p_id: correctionId, p_expected_version: 2, p_reason: "Synthetic void race" }, { accessToken: tokens.get("associate") }),
    ]); pass("expenditure-correct-void", "concurrencyCases");
    const claimExpense = await recordAndVerify("70.00", "Liquidation claim race expense");
    await raceOne("liquidation claims", [1, 2].map((index) => () => client.rpc("phase2_create_liquidation_v2", { p_program_id: PROGRAM, p_summary: { period_start: isoDate(-1), period_end: isoDate(), narrative: `Synthetic liquidation race ${index}.`, exception_notes: null }, p_expenditure_ids: [claimExpense] }, { accessToken: tokens.get("associate") })), ["23505"]); pass("liquidation-claims", "concurrencyCases");
    await configure("program_finance", "off");

    // External contact email is explicitly requeued; suppressed rows never auto-release.
    await configure("partners", "synthetic", PARTNER_ROOTS);
    await configure("external_contact_email", "synthetic", ["f3100000-0000-4000-8000-000000000002"]);
    expectDenied(await client.rpc("phase2_requeue_contact_email", { p_outbox_id: "f3500000-0000-4000-8000-000000000001", p_reason: "Synthetic cross-target requeue" }, { accessToken: tokens.get("associate") }), "email target outside allowlist"); pass("email-live-target", "rpcAbuseCases");
    await configure("external_contact_email", "synthetic", [PARTNER]);
    expectOk(await client.rpc("phase2_requeue_contact_email", { p_outbox_id: "f3500000-0000-4000-8000-000000000001", p_reason: "Synthetic explicit relevant requeue" }, { accessToken: tokens.get("associate") }), "explicit email requeue");
    const claimRace = await runSynchronizedRace([1, 2].map(() => () => client.rpc("phase2_claim_contact_email_outbox", { p_limit: 1, p_lease_seconds: 60 }, { accessToken: serviceRoleKey })));
    assert.ok(claimRace.every((item) => item.status === "fulfilled" && item.value.ok));
    const claimedRows = claimRace.flatMap((item) => item.value.data ?? []); assert.equal(claimedRows.length, 1, "outbox claim had multiple winners");
    const firstClaim = claimedRows[0];
    expectOk(await client.postgrest(`partner_contact_email_outbox?id=eq.${firstClaim.id}`, { method: "PATCH", accessToken: serviceRoleKey, body: { lease_expires_at: "2000-01-01T00:00:00Z" } }), "synthetic lease expiry setup");
    const recovered = await client.rpc("phase2_claim_contact_email_outbox", { p_limit: 1, p_lease_seconds: 60 }, { accessToken: serviceRoleKey }); expectOk(recovered, "outbox lease recovery");
    assert.equal(recovered.data.length, 1); assert.notEqual(recovered.data[0].claimToken, firstClaim.claimToken);
    expectDenied(await client.rpc("phase2_finalize_contact_email", { p_outbox_id: firstClaim.id, p_claim_token: firstClaim.claimToken, p_outcome: "sent", p_error_code: null }, { accessToken: serviceRoleKey }), "stale email claim token", ["40001"]);
    expectOk(await client.rpc("phase2_finalize_contact_email", { p_outbox_id: firstClaim.id, p_claim_token: recovered.data[0].claimToken, p_outcome: "sent", p_error_code: null }, { accessToken: serviceRoleKey }), "email finalize");
    pass("outbox-claim-recovery", "concurrencyCases");
    await configure("external_contact_email", "off");
    await configure("partners", "off");

    // Behavioral Storage attacks use the real local Storage API. No object may remain.
    const storageToken = tokens.get("volunteer");
    const storageCases = new Map([
      ["anonymous-list", () => client.storageList("phase2-partnership-documents", "")],
      ["unauthorized-list", () => client.storageList("phase2-partnership-documents", "", { accessToken: storageToken })],
      ["unauthorized-read", () => client.storage("phase2-partnership-documents", `${PARTNER}/synthetic.pdf`, { method: "GET", accessToken: storageToken })],
      ["unauthorized-upload", () => client.storage("phase2-partnership-documents", `${PARTNER}/synthetic.pdf`, { method: "POST", accessToken: storageToken, body: "synthetic" })],
      ["unauthorized-update", () => client.storage("phase2-partnership-documents", `${PARTNER}/synthetic.pdf`, { method: "PUT", accessToken: storageToken, body: "synthetic" })],
      ["unauthorized-delete", () => client.storage("phase2-partnership-documents", `${PARTNER}/synthetic.pdf`, { method: "DELETE", accessToken: storageToken })],
      ["cross-parent", () => client.storage("phase2-program-financial-evidence", `${PARTNER}/synthetic.pdf`, { method: "GET", accessToken: tokens.get("associate") })],
      ["caller-path", () => client.storage("phase2-historical-evidence", "caller-selected/synthetic.pdf", { method: "POST", accessToken: tokens.get("researcher"), body: "synthetic" })],
      ["traversal", async () => { assert.throws(() => client.storage("phase2-historical-evidence", "../escape.pdf", { method: "GET", accessToken: storageToken }), /request path is invalid/); return { ok: false, status: 400 }; }],
      ["oversize", () => client.storage("phase2-partnership-documents", `${PARTNER}/oversize.pdf`, { method: "POST", accessToken: storageToken, body: "x".repeat(10 * 1024 * 1024 + 1) })],
      ["mime-spoof", () => client.storage("phase2-partnership-documents", `${PARTNER}/spoof.pdf`, { method: "POST", accessToken: storageToken, body: "FFD8-SYNTHETIC" })],
      ["quarantine-download", () => client.storage("phase2-partnership-documents", `${PARTNER}/${"3".repeat(64)}.pdf`, { method: "GET", accessToken: tokens.get("director") })],
    ]);
    for (const id of registry.storageCases) {
      const before = await counts(); const result = await storageCases.get(id)();
      if (result.ok) assert.ok(Array.isArray(result.data) && result.data.length === 0, `${id} disclosed Storage metadata`);
      else assert.ok(result.status >= 400 && result.status < 500, `${id} returned unexpected ${result.status}`);
      assert.equal((await counts()).storage_objects, before.storage_objects, `${id} left an object`); pass(id, "storageCases");
    }

    // Exact synthetic reconciliation uses service-role reads only inside the disposable stack.
    const serviceGet = async (path) => { const result = await client.postgrest(path, { accessToken: serviceRoleKey }); expectOk(result, path); return result.data; };
    const barangayPartners = await serviceGet("partner_entities?select=id,barangay_id,data_mode&data_mode=eq.synthetic&barangay_id=not.is.null");
    assert.equal(new Set(barangayPartners.map((row) => row.barangay_id)).size, 2, "one synthetic Partner per synthetic barangay was not preserved"); pass("partner-barangay-count", "reconciliationCases");
    const mappings = await serviceGet("legacy_account_partner_mappings?select=legacy_user_id,proposal_count,program_count,pending_work_count");
    assert.ok(mappings.every((row) => [row.proposal_count, row.program_count, row.pending_work_count].every(Number.isInteger))); pass("legacy-attribution-count", "reconciliationCases");
    const actors = await serviceGet("users?id=in.(f2200000-0000-4000-8000-000000000013,f2200000-0000-4000-8000-000000000014,f2200000-0000-4000-8000-000000000015)&select=id");
    assert.deepEqual(actors.map((row) => row.id).sort(), ["f2200000-0000-4000-8000-000000000013", "f2200000-0000-4000-8000-000000000014", "f2200000-0000-4000-8000-000000000015"]); pass("actor-ids-unchanged", "reconciliationCases");
    const history = await serviceGet("historical_programs?select=id,status,quality,data_mode&data_mode=eq.synthetic");
    assert.ok(history.some((row) => row.quality === "partial_verified") && history.some((row) => row.quality === "unverified")); pass("historical-quality-separation", "reconciliationCases");
    const budgetRows = await serviceGet(`proposal_budget_revisions?select=proposal_id,cash_total&proposal_id=eq.${PROPOSAL}`);
    assert.equal(Number(budgetRows[0].cash_total), 1000); pass("budget-shadow-total", "reconciliationCases");
    const handoffs = await serviceGet("program_handoffs?select=proposal_id,program_id");
    assert.equal(new Set(handoffs.map((row) => row.proposal_id)).size, handoffs.length); pass("one-program-per-handoff", "reconciliationCases");
    const reminders = await serviceGet("partnership_reminder_deliveries?select=delivery_key");
    assert.equal(new Set(reminders.map((row) => row.delivery_key)).size, reminders.length); pass("unique-reminders", "reconciliationCases");
    const emailEvents = await serviceGet("partner_contact_email_events?select=id,outbox_id,to_status,attempt_number");
    assert.equal(new Set(emailEvents.map((row) => row.id)).size, emailEvents.length); pass("unique-email-events", "reconciliationCases");

    // Forward-safe rollback rehearsal.
    for (const component of registry.components) await configure(component, "off");
    await setV1("partners"); await setV1("proposals");
    rollbackBaseline = await counts();
    for (const component of registry.components) {
      const state = await client.rpc("phase2_get_readiness", { p_component: component }, { accessToken: tokens.get("director") }); expectOk(state, `${component} final readiness`); assert.equal(state.data.mode, "off");
    }
    pass("all-modes-off", "rollbackCases");
    const partnerState = await client.rpc("phase2_get_readiness", { p_component: "partners" }, { accessToken: tokens.get("director") }); assert.equal(partnerState.data.writeAuthority, "v1"); pass("partner-authority-v1", "rollbackCases");
    const proposalState = await client.rpc("phase2_get_readiness", { p_component: "proposals" }, { accessToken: tokens.get("director") }); assert.equal(proposalState.data.writeAuthority, "v1"); pass("proposal-authority-v1", "rollbackCases");
    expectDenied(await client.rpc("phase2_create_partner", { p_payload: { name: "Rollback bypass", entity_type: "other", classification: "external", roles: ["partner"], barangay_id: null } }, { accessToken: tokens.get("associate") }), "RPC rollback bypass"); pass("rpc-writes-denied", "rollbackCases");
    await directNoMutation("partner_entities", "POST", tokens.get("associate"), { name: "Rollback direct", entity_type: "other", classification: "external", data_mode: "synthetic" }, PARTNER); pass("direct-writes-denied", "rollbackCases");
    const workerResults = await Promise.all([
      client.rpc("phase2_generate_renewal_reminders", {}, { accessToken: serviceRoleKey }), client.rpc("phase2_purge_historical_imports", {}, { accessToken: serviceRoleKey }), client.rpc("phase2_claim_contact_email_outbox", { p_limit: 5, p_lease_seconds: 60 }, { accessToken: serviceRoleKey }),
    ]);
    assert.ok(workerResults.every((result) => result.ok)); assert.equal(Number(workerResults[0].data), 0); assert.equal(Number(workerResults[1].data), 0); assert.deepEqual(workerResults[2].data, []); pass("workers-no-op", "rollbackCases");
    const explicitlyRequeued = await serviceGet("partner_contact_email_outbox?select=id,status&idempotency_key=eq.synthetic-outbox-001");
    assert.equal(explicitlyRequeued.length, 1); assert.equal(explicitlyRequeued[0].status, "sent");
    const suppressed = await serviceGet("partner_contact_email_outbox?select=id,status&idempotency_key=eq.synthetic-outbox-retained");
    assert.equal(suppressed.length, 1); assert.equal(suppressed[0].status, "suppressed", "a message without an explicit requeue was released"); pass("suppressed-mail-retained", "rollbackCases");
    assert.deepEqual(await counts(), rollbackBaseline); pass("governed-history-retained", "rollbackCases");
  } finally {
    for (const component of ["partners", "historical_programs", "proposals", "program_finance", "external_contact_email"]) {
      try { await configure(component, "off"); } catch { /* the harness will fail on the original error */ }
    }
    try { await setV1("partners"); await setV1("proposals"); } catch { /* preserve the original failure */ }
  }

  for (const group of ["jwtCases", "rpcAbuseCases", "directTableCases", "concurrencyCases", "storageCases", "reconciliationCases", "rollbackCases"]) {
    assert.deepEqual([...passed].filter((value) => value.startsWith(`${group}:`)).map((value) => value.slice(group.length + 1)).sort(), registry[group].slice().sort(), `${group} executor registry drift`);
  }
  assert.equal(passed.size, contract.cases);
  return { schema: contract.schema, passed: passed.size, failed: 0, skipped: 0, finalState: contract.finalState };
}
