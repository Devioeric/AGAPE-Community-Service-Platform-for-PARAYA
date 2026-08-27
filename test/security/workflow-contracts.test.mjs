import assert from "node:assert/strict";
import test from "node:test";

import {
  PROPOSAL_CREATE_ONLY_FIELDS,
  PROPOSAL_PROTECTED_FIELDS,
  parseProposalCreateInput,
  parseProposalUpdateInput,
} from "../../src/lib/proposals/mutation-contracts.ts";
import {
  authorizeProposalAction,
  parseProposalActionInput,
} from "../../src/lib/proposals/workflow-policy.ts";
import {
  PROGRAM_ACTIVITY_PROTECTED_FIELDS,
  parseProgramActivityCreateInput,
  parseProgramActivityUpdateInput,
  parseProgramBudgetCreateInput,
  parseProgramCreateInput,
  parseProgramUpdateInput,
} from "../../src/lib/programs/mutation-contracts.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const proposalDraft = {
  title: "Community Learning Support",
  rationale: "The approved community evidence identifies a learning support gap.",
  barangay_id: uuid,
  timeline_start: "2026-09-01",
  timeline_end: "2026-09-30",
  budget: 0,
  expected_beneficiary_count: 25,
  sdg_alignments: [{ sdg_number: 4, indicator: "Access to learning support" }],
};

test("proposal content contracts accept normalized draft content and zero-budget projects", () => {
  const parsed = parseProposalCreateInput({
    ...proposalDraft,
    title: `  ${proposalDraft.title}  `,
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.title, proposalDraft.title);
    assert.equal(parsed.data.budget, 0);
    assert.equal(parsed.data.sdg_alignments?.[0].sdg_number, 4);
  }
});

test("proposal create accepts strict recommendation provenance and update cannot replace it", () => {
  const recommendationContext = {
    need_id: uuid,
    evidence_snapshot_id: "22222222-2222-4222-8222-222222222222",
    recommendation_fingerprint: "a".repeat(64),
  };
  const parsed = parseProposalCreateInput({
    ...proposalDraft,
    recommendation_context: recommendationContext,
  });

  assert.equal(PROPOSAL_CREATE_ONLY_FIELDS.includes("recommendation_context"), true);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.data.recommendation_context, recommendationContext);
  assert.equal(parseProposalUpdateInput({
    title: "Revised recommendation draft",
    recommendation_context: recommendationContext,
  }).ok, false);
});

test("proposal recommendation provenance rejects malformed or extended client input", () => {
  const valid = {
    need_id: uuid,
    evidence_snapshot_id: null,
    recommendation_fingerprint: "b".repeat(64),
  };
  assert.equal(parseProposalCreateInput({
    ...proposalDraft,
    recommendation_context: { ...valid, raw_recommendation: "Do not retain this prose." },
  }).ok, false);
  assert.equal(parseProposalCreateInput({
    ...proposalDraft,
    recommendation_context: { ...valid, need_id: "not-a-uuid" },
  }).ok, false);
  assert.equal(parseProposalCreateInput({
    ...proposalDraft,
    recommendation_context: { ...valid, evidence_snapshot_id: "not-a-uuid" },
  }).ok, false);
  assert.equal(parseProposalCreateInput({
    ...proposalDraft,
    recommendation_context: { ...valid, recommendation_fingerprint: "ABC" },
  }).ok, false);
});

test("proposal create and update reject every workflow-controlled field", () => {
  for (const field of PROPOSAL_PROTECTED_FIELDS) {
    const value = field === "finance_clearance" ? true : "attacker-controlled";
    assert.equal(
      parseProposalCreateInput({ ...proposalDraft, [field]: value }).ok,
      false,
      `create must reject ${field}`,
    );
    assert.equal(
      parseProposalUpdateInput({ title: "Revised title", [field]: value }).ok,
      false,
      `update must reject ${field}`,
    );
  }
});

test("proposal contracts reject malformed dates, identifiers, SDGs, and empty updates", () => {
  assert.equal(parseProposalCreateInput({ ...proposalDraft, barangay_id: "not-a-uuid" }).ok, false);
  assert.equal(parseProposalCreateInput({ ...proposalDraft, timeline_start: "2026-02-30" }).ok, false);
  assert.equal(parseProposalCreateInput({ ...proposalDraft, timeline_end: "2026-08-01" }).ok, false);
  assert.equal(parseProposalCreateInput({ ...proposalDraft, sdg_alignments: [{ sdg_number: 18 }] }).ok, false);
  assert.equal(parseProposalUpdateInput({}).ok, false);
});

test("program contracts reject ownership, approval, and unknown fields", () => {
  const validProgram = {
    title: "Learning Support Program",
    barangay_id: uuid,
    start_date: "2026-09-01",
    end_date: "2026-09-30",
    status: "draft",
    max_volunteers: 20,
  };

  assert.equal(parseProgramCreateInput(validProgram).ok, true);
  assert.equal(parseProgramCreateInput({ ...validProgram, created_by: uuid }).ok, false);
  assert.equal(parseProgramCreateInput({ ...validProgram, approval_status: "approved" }).ok, false);
  assert.equal(parseProgramUpdateInput({ finance_clearance: true }).ok, false);
});

test("program-budget contracts accept financial content but reject ownership and approval metadata", () => {
  const validBudget = {
    category: "Learning materials",
    allocated: 5_000,
    spent: 0,
    notes: "Initial allocation",
  };

  assert.equal(parseProgramBudgetCreateInput(validBudget).ok, true);
  assert.equal(parseProgramBudgetCreateInput({ ...validBudget, program_id: uuid }).ok, false);
  assert.equal(parseProgramBudgetCreateInput({ ...validBudget, created_by: uuid }).ok, false);
  assert.equal(parseProgramBudgetCreateInput({ ...validBudget, approval_status: "approved" }).ok, false);
  assert.equal(parseProgramBudgetCreateInput({ ...validBudget, spent: -1 }).ok, false);
});

test("program-activity contracts preserve ordinary content and reports", () => {
  const created = parseProgramActivityCreateInput({
    title: "  Learning session  ",
    description: "Facilitated community learning session",
    date: "2026-09-15",
    location: "Barangay covered court",
  });
  assert.equal(created.ok, true);
  if (created.ok) {
    assert.equal(created.data.title, "Learning session");
    assert.equal(created.data.status, "planned");
  }

  const updated = parseProgramActivityUpdateInput({
    status: "completed",
    report_1: "The planned learning outcomes were achieved.",
    report_2: "All documented expenses remained within allocation.",
  });
  assert.equal(updated.ok, true);
});

test("program-activity contracts reject workflow, ownership, attendance, and audit fields", () => {
  const validCreate = { title: "Learning session", status: "planned" };
  for (const field of PROGRAM_ACTIVITY_PROTECTED_FIELDS) {
    assert.equal(
      parseProgramActivityCreateInput({ ...validCreate, [field]: "attacker-controlled" }).ok,
      false,
      `activity create must reject ${field}`,
    );
    assert.equal(
      parseProgramActivityUpdateInput({ title: "Revised session", [field]: "attacker-controlled" }).ok,
      false,
      `activity update must reject ${field}`,
    );
  }

  assert.equal(parseProgramActivityCreateInput({ ...validCreate, status: "approved" }).ok, false);
  assert.equal(parseProgramActivityCreateInput({ ...validCreate, date: "2026-02-30" }).ok, false);
  assert.equal(parseProgramActivityUpdateInput({}).ok, false);
  assert.equal(parseProgramActivityCreateInput({ ...validCreate, report_1: "too early" }).ok, false);
});

test("proposal action requests reject unknown or protected request fields", () => {
  assert.equal(parseProposalActionInput({ action: "advance" }).ok, true);
  assert.equal(parseProposalActionInput({ action: "approve" }).ok, false);
  assert.equal(parseProposalActionInput({ action: "advance", status: "approved" }).ok, false);
  assert.equal(parseProposalActionInput({ action: "reject", reviewed_by: uuid }).ok, false);
});

function decision(overrides) {
  return authorizeProposalAction({
    action: "advance",
    role: "paraya_researcher",
    currentStatus: "submitted",
    financeClearance: false,
    notes: null,
    finance_notes: null,
    ...overrides,
  });
}

test("Finance alone clears or returns a budget and cannot make a project decision", () => {
  assert.equal(decision({
    action: "mark_finance_cleared",
    role: "finance_officer",
    currentStatus: "finance_review",
  }).allowed, true);
  assert.equal(decision({
    action: "mark_finance_cleared",
    role: "paraya_director",
    currentStatus: "finance_review",
  }).allowed, false);
  assert.equal(decision({
    action: "request_revisions",
    role: "finance_officer",
    currentStatus: "finance_review",
    notes: "Revise the budget basis.",
  }).allowed, true);
  assert.equal(decision({
    action: "request_revisions",
    role: "paraya_researcher",
    currentStatus: "finance_review",
    notes: "Revise the budget basis.",
  }).allowed, false);
  assert.equal(decision({
    action: "advance",
    role: "finance_officer",
    currentStatus: "finance_review",
    financeClearance: true,
  }).allowed, false);
});

test("only the Director can finally approve or reject after Finance clearance", () => {
  assert.equal(decision({
    action: "advance",
    role: "paraya_director",
    currentStatus: "finance_review",
    financeClearance: true,
  }).allowed, true);
  assert.equal(decision({
    action: "advance",
    role: "paraya_associate",
    currentStatus: "finance_review",
    financeClearance: true,
  }).allowed, false);
  assert.equal(decision({
    action: "reject",
    role: "paraya_director",
    currentStatus: "finance_review",
    financeClearance: true,
    notes: "Rejected because the final evidence remains insufficient.",
  }).allowed, true);
  assert.equal(decision({
    action: "reject",
    role: "paraya_director",
    currentStatus: "finance_review",
    financeClearance: true,
    notes: null,
  }).allowed, false);
  assert.equal(decision({
    action: "reject",
    role: "service_role",
    currentStatus: "finance_review",
    financeClearance: true,
    notes: "Automated rejection is forbidden.",
  }).allowed, false);
});
