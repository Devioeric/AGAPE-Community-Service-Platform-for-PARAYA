import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ALL_TESTED_ROLES,
  APPROVED_LOGIN_ROLES,
  CAPABILITIES,
  CAPABILITY_TARGETS,
  LEGACY_COMPATIBILITY_ROLES,
  ROLE_CAPABILITIES,
  ROLE_FUNCTION_CASES,
  ROLE_HOME,
  ROLE_SURFACES,
  WORKFLOW_CASES,
} from "./role-function-catalog.mjs";

test("functional catalog covers every canonical capability with an existing implementation target", () => {
  assert.deepEqual(Object.keys(CAPABILITY_TARGETS).sort(), [...CAPABILITIES].sort());
  for (const [capability, target] of Object.entries(CAPABILITY_TARGETS)) {
    assert.match(target.route, /^\//, `${capability} must name a route`);
    assert.match(target.method, /^(GET|POST|PUT|PATCH|DELETE)$/, `${capability} must name an HTTP method`);
    assert.equal(existsSync(target.source), true, `${capability} target source is missing: ${target.source}`);
    assert.equal(typeof target.mutation, "boolean");
  }
});

test("every catalog target exports the HTTP method it claims to exercise", async () => {
  for (const [capability, target] of Object.entries(CAPABILITY_TARGETS)) {
    const source = await readFile(target.source, "utf8");
    assert.ok(source.includes(`export async function ${target.method}`), `${capability} maps to a missing ${target.method} handler in ${target.source}`);
  }
});

test("approved and legacy roles have stable homes, page surfaces, and forbidden boundaries", () => {
  assert.equal(new Set(ALL_TESTED_ROLES).size, ALL_TESTED_ROLES.length);
  for (const role of ALL_TESTED_ROLES) {
    const surface = ROLE_SURFACES[role];
    assert.ok(surface, `${role} surface is missing`);
    assert.equal(surface.home, ROLE_HOME[role]);
    assert.ok(surface.pages.length > 0, `${role} needs a positive page case`);
    assert.ok(surface.forbidden.length > 0, `${role} needs a negative route case`);
  }
  assert.equal(APPROVED_LOGIN_ROLES.length, 9);
  assert.deepEqual(LEGACY_COMPATIBILITY_ROLES, ["office", "student_org", "department"]);
});

test("every granted role capability produces one executable positive case", () => {
  const expected = Object.values(ROLE_CAPABILITIES).reduce((total, capabilities) => total + (capabilities?.length ?? 0), 0);
  assert.equal(ROLE_FUNCTION_CASES.length, expected);
  assert.equal(new Set(ROLE_FUNCTION_CASES.map(({ id }) => id)).size, ROLE_FUNCTION_CASES.length);
  for (const item of ROLE_FUNCTION_CASES) {
    assert.equal(item.expectation, "allowed");
    assert.ok(item.route && item.method && item.source);
    assert.ok(["disposable-synthetic", "disposable-and-staging-read"].includes(item.environment));
  }
});

test("legacy compatibility identities remain historical-read-only", () => {
  for (const role of LEGACY_COMPATIBILITY_ROLES) {
    assert.deepEqual(ROLE_CAPABILITIES[role], ["legacy_partner.history.read"]);
    assert.deepEqual(ROLE_SURFACES[role].pages, ["/partner/proposals", "/partner/programs"]);
  }
});

test("cross-role catalog covers every tested actor and uses synthetic mutation environments", () => {
  assert.equal(new Set(WORKFLOW_CASES.map(({ id }) => id)).size, WORKFLOW_CASES.length);
  const covered = new Set(WORKFLOW_CASES.flatMap(({ actors }) => actors));
  for (const role of ALL_TESTED_ROLES) assert.equal(covered.has(role), true, `${role} is absent from cross-role journeys`);
  for (const workflow of WORKFLOW_CASES) {
    assert.match(workflow.id, /^workflow\./);
    assert.ok(workflow.actors.length >= 2);
    assert.ok(["disposable-synthetic", "disposable-and-staging-read"].includes(workflow.environment));
  }
});

test("Admin and Finance retain their non-operational boundaries in the catalog", () => {
  const adminCaps = new Set(ROLE_CAPABILITIES.admin);
  for (const denied of ["program.read", "proposal.read", "profiling.detail.read", "budget.read", "volunteer.directory.read"]) {
    assert.equal(adminCaps.has(denied), false, `Admin must not receive ${denied}`);
  }
  const financeCaps = new Set(ROLE_CAPABILITIES.finance_officer);
  assert.equal(financeCaps.has("proposal.finance"), true);
  assert.equal(financeCaps.has("budget.review"), true);
  for (const denied of ["proposal.create", "proposal.decide", "program.manage", "budget.actual.record", "profiling.detail.read"]) {
    assert.equal(financeCaps.has(denied), false, `Finance must not receive ${denied}`);
  }
});

test("the executable browser matrix stays synchronized with the role catalog", async () => {
  const browserMatrix = await readFile("e2e/role-surface-access.spec.ts", "utf8");
  for (const [role, surface] of Object.entries(ROLE_SURFACES)) {
    assert.match(browserMatrix, new RegExp(`\\b${role}\\s*:`), `${role} is missing from the browser matrix`);
    for (const path of [surface.home, ...surface.pages, ...surface.forbidden]) {
      assert.ok(browserMatrix.includes(`\"${path}\"`), `${role} browser coverage is missing ${path}`);
    }
  }
  for (const state of ["pending", "inactive", "suspended"]) {
    assert.ok(browserMatrix.includes(`\"${state}\"`), `${state} account denial is missing from the browser matrix`);
  }
});
