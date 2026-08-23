import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSIGNABLE_ROLES,
  canClearFinance,
  canEditProposal,
  canMakeFinalProposalDecision,
  canManageProgram,
  canReturnFinanceForRevision,
  canReviewProposal,
  canSubmitProposal,
} from "../../src/lib/auth/roles.ts";

const parayaRoles = [
  "paraya_director",
  "paraya_associate",
  "paraya_researcher",
];
const nonParayaRoles = [
  "finance_officer",
  "barangay_captain",
  "barangay_secretary",
  "barangay_mother_leader",
  "volunteer",
  "office",
  "student_org",
  "department",
  "admin",
];

test("only PARAYA officers receive new proposal and program write authority", () => {
  for (const role of parayaRoles) {
    assert.equal(canSubmitProposal(role), true);
    assert.equal(canEditProposal(role), true);
    assert.equal(canReviewProposal(role), true);
    assert.equal(canManageProgram(role), true);
  }

  for (const role of nonParayaRoles) {
    assert.equal(canSubmitProposal(role), false, `${role} must not submit proposals`);
    assert.equal(canEditProposal(role), false, `${role} must not edit proposals`);
    assert.equal(canReviewProposal(role), false, `${role} must not review proposals`);
    assert.equal(canManageProgram(role), false, `${role} must not manage programs`);
  }
});

test("Finance alone clears or returns the budget", () => {
  assert.equal(canClearFinance("finance_officer"), true);
  assert.equal(canReturnFinanceForRevision("finance_officer"), true);

  for (const role of [...parayaRoles, "admin", "volunteer", "office"]) {
    assert.equal(canClearFinance(role), false);
    assert.equal(canReturnFinanceForRevision(role), false);
  }
});

test("the Director alone makes the final proposal decision", () => {
  assert.equal(canMakeFinalProposalDecision("paraya_director"), true);

  for (const role of [
    "paraya_associate",
    "paraya_researcher",
    "paraya_officer",
    "finance_officer",
    "admin",
    "office",
  ]) {
    assert.equal(canMakeFinalProposalDecision(role), false);
  }
});

test("new account assignment excludes institutional and legacy login roles", () => {
  const values = ASSIGNABLE_ROLES.map(({ value }) => value);

  assert.deepEqual(values, [
    "paraya_director",
    "paraya_associate",
    "paraya_researcher",
    "finance_officer",
    "barangay_captain",
    "barangay_secretary",
    "barangay_mother_leader",
    "volunteer",
  ]);
  for (const removed of ["office", "student_org", "department", "paraya_officer", "barangay_official"]) {
    assert.equal(values.includes(removed), false);
  }
});
