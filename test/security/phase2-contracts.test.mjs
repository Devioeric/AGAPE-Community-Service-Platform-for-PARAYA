import assert from "node:assert/strict";
import test from "node:test";
import { hasCapability } from "../../src/lib/auth/capabilities.ts";
import {
  historicalProgramCreateSchema, partnerContactSchema, partnerCreateSchema,
  partnerContactUpdateSchema, partnerMergeSchema, partnerNeedLinkSchema, partnershipTermTransitionSchema,
  proposalDraftGraphSchema, proposalWorkflowSchema, programExpenditureSchema,
} from "../../src/lib/phase2/contracts.ts";
import { multiplyDecimal, sumMoney } from "../../src/lib/phase2/money.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

test("Phase 2 capability defaults preserve role separation and deny-only overrides", () => {
  assert.equal(hasCapability("paraya_director", {}, "partner.policy.manage"), true);
  assert.equal(hasCapability("paraya_researcher", {}, "historical_program.review"), true);
  assert.equal(hasCapability("paraya_associate", {}, "historical_program.review"), false);
  assert.equal(hasCapability("finance_officer", {}, "budget.review"), true);
  assert.equal(hasCapability("finance_officer", {}, "budget.prepare"), false);
  assert.equal(hasCapability("admin", {}, "budget.read"), false);
  assert.equal(hasCapability("office", {}, "partner.contact.read"), false);
  assert.equal(hasCapability("paraya_director", { partner_documents: false }, "partner.document.read"), false);
});

test("Partner contracts reject unknown fields and require email consent evidence", () => {
  assert.equal(partnerCreateSchema.safeParse({ name: "Binang 2nd", type: "barangay", classification: "external", roles: ["partner"], role: "admin" }).success, false);
  assert.equal(partnerContactSchema.safeParse({ fullName: "Contact", preferredChannel: "email", isPrimary: true, statusEmailOptIn: true, email: "x@example.test", activeFrom: "2026-01-01" }).success, false);
  assert.equal(partnerContactSchema.safeParse({ fullName: "Contact", preferredChannel: "email", isPrimary: true, statusEmailOptIn: true, email: "x@example.test", consentSource: "signed form", consentAt: "2026-01-01T00:00:00.000Z", activeFrom: "2026-01-01" }).success, true);
  assert.equal(partnerContactUpdateSchema.safeParse({ expectedVersion: 2, isPrimary: true, role: "admin" }).success, false);
  assert.equal(partnershipTermTransitionSchema.safeParse({ action: "end", expectedVersion: 2, effectiveOn: "2026-08-26", reason: "Relationship completed" }).success, true);
  assert.equal(partnerMergeSchema.safeParse({ targetPartnerId: uuid2, expectedVersion: 1, reason: "Reviewed duplicate record" }).success, true);
  assert.equal(partnerNeedLinkSchema.safeParse({ termId: uuid, needId: uuid2, expectedTermVersion: 1, coverage: "partial", evidenceType: "program" }).success, false);
});

test("Historical programs require date precision consistency", () => {
  const base = { title: "Program", category: "education", datePrecision: "year", startsOn: "2024-01-01", sourceType: "paper", partnerIds: [], barangayIds: [], sdgs: [] };
  assert.equal(historicalProgramCreateSchema.safeParse(base).success, true);
  assert.equal(historicalProgramCreateSchema.safeParse({ ...base, datePrecision: "unknown", startsOn: "2024-01-01" }).success, false);
  assert.equal(historicalProgramCreateSchema.safeParse({ ...base, beneficiaryNames: ["Person"] }).success, false);
});

test("Structured proposal contract enforces origin, lead, target overlap, and 1-17 SDGs", () => {
  const proposal = {
    title: "Learning support", description: "Community learning support", originChannel: "partner_document", responsibleOfficerId: uuid,
    projectCategoryId: uuid, startsOn: "2026-09-01", endsOn: "2026-10-01", targets: [{ barangayId: uuid, isLead: true }],
    needs: [{ needId: uuid2, targetAreaKey: "lead", intendedCoverage: "partial" }], beneficiaryCategoryCodes: ["students"],
    finalBeneficiaryCount: 20, beneficiarySourceDescription: "Approved community planning record", sdgNumbers: [4, 17], zeroCash: false,
    budgetItems: [{ categoryId: uuid, kind: "cash", description: "Materials", quantity: "2.000", unit: "set", unitCost: "100.00", sortOrder: 0 }],
    fundingSources: [{ type: "internal_dyci", state: "expected", cashValue: "200.00", inKindValue: "0.00" }],
  };
  assert.equal(proposalDraftGraphSchema.safeParse(proposal).success, false, "partner origin must identify its Partner");
  assert.equal(proposalDraftGraphSchema.safeParse({ ...proposal, originatingPartnerId: uuid2 }).success, true);
  assert.equal(proposalDraftGraphSchema.safeParse({ ...proposal, originatingPartnerId: uuid2, sdgNumbers: [18] }).success, false);
  assert.equal(proposalWorkflowSchema.safeParse({ action: "director_reject", expectedVersion: 1, remarks: "Evidence does not support approval" }).success, true);
});

test("Money helpers calculate exact decimal strings and receipt rules are explicit", () => {
  assert.equal(multiplyDecimal("2.500", "10.00"), "25.00");
  assert.equal(sumMoney(["0.10", "0.20", "100.00"]), "100.30");
  assert.throws(() => multiplyDecimal("0.001", "0.01"), /sub-cent/);
  assert.equal(programExpenditureSchema.safeParse({ budgetItemId: uuid, amount: "10.00", spentOn: "2026-09-01", description: "Fare" }).success, false);
});
