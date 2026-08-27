import assert from "node:assert/strict";
import test from "node:test";

import { CAPABILITY_MODULE, hasCapability, normalizeDenyOnlyOverrides, permissionModulesForRole } from "../../src/lib/auth/capabilities.ts";

test("role capabilities isolate Admin from operational domains", () => {
  assert.equal(hasCapability("admin", {}, "admin.users.manage"), true);
  for (const capability of ["program.read", "profiling.detail.read", "profiling.aggregate.read", "survey.manage", "donation.manage", "impact.manage"]) {
    assert.equal(hasCapability("admin", {}, capability), false, `Admin must not have ${capability}`);
  }
  assert.equal(hasCapability("paraya_researcher", {}, "profiling.detail.read"), true);
  assert.equal(hasCapability("paraya_researcher", {}, "profiling.collect"), true);
  assert.equal(hasCapability("paraya_director", {}, "profiling.detail.read"), false);
  assert.equal(hasCapability("barangay_secretary", {}, "profiling.validate"), true);
  assert.equal(hasCapability("barangay_mother_leader", {}, "profiling.collect"), true);
});

test("capability aliases and generated permission controls use the canonical matrix", () => {
  assert.equal(CAPABILITY_MODULE["volunteer.self"], "volunteers");
  assert.equal(CAPABILITY_MODULE["ai.recommendation.review"], "ai_assistance");
  assert.equal(permissionModulesForRole("admin").some((module) => module.key === "profiling"), false);
  assert.equal(permissionModulesForRole("paraya_researcher").some((module) => module.key === "profiling"), true);
  assert.equal(hasCapability("paraya_researcher", {}, "ai.recommendation.review"), true);
  assert.equal(hasCapability("paraya_director", {}, "ai.recommendation.review"), true);
  assert.equal(hasCapability("paraya_associate", {}, "ai.recommendation.review"), false);
  assert.equal(hasCapability("paraya_researcher", { ai_assistance: false }, "ai.recommendation.review"), false);
});

test("permission overrides can deny but never grant a role capability", () => {
  assert.equal(hasCapability("paraya_researcher", { profiling: false }, "profiling.detail.read"), false);
  assert.equal(hasCapability("volunteer", { profiling: true }, "profiling.detail.read"), false);
  assert.deepEqual(normalizeDenyOnlyOverrides("paraya_researcher", { profiling: false, programs: true }), { profiling: false });
  assert.throws(() => normalizeDenyOnlyOverrides("volunteer", { profiling: false }), /Unknown permission module/);
});

test("former institutional roles are historical-read only", () => {
  for (const role of ["office", "student_org", "department"]) {
    assert.equal(hasCapability(role, {}, "legacy_partner.history.read"), true);
    assert.equal(hasCapability(role, {}, "program.read"), false);
    assert.equal(hasCapability(role, {}, "profiling.aggregate.read"), false);
  }
});
