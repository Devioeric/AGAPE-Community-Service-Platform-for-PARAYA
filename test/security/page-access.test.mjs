import assert from "node:assert/strict";
import test from "node:test";

import { canAccessPage, PAGE_ACCESS_RULES } from "../../src/lib/auth/capabilities.ts";
import { ROLE_SURFACES } from "../functional/role-function-catalog.mjs";

test("every cataloged positive and forbidden same-portal page follows the capability matrix", () => {
  for (const [role, surface] of Object.entries(ROLE_SURFACES)) {
    assert.equal(canAccessPage(role, {}, surface.home), true, `${role} cannot reach its home`);
    for (const path of surface.pages) {
      assert.equal(canAccessPage(role, {}, path), true, `${role} cannot reach intended page ${path}`);
    }
    for (const path of surface.forbidden.filter((candidate) => candidate.startsWith(surface.home))) {
      assert.equal(canAccessPage(role, {}, path), false, `${role} can reach forbidden same-portal page ${path}`);
    }
  }
});

test("page access honors deny-only module overrides", () => {
  assert.equal(canAccessPage("paraya_researcher", { profiling: false }, "/officer/profiling"), false);
  assert.equal(canAccessPage("finance_officer", { budgets: false }, "/officer/finance"), false);
  assert.equal(canAccessPage("barangay_captain", { community_needs: false }, "/barangay/approvals"), false);
});

test("sensitive same-portal routes have unique rules and specific analytics routing wins", () => {
  assert.equal(new Set(PAGE_ACCESS_RULES.map(({ prefix }) => prefix)).size, PAGE_ACCESS_RULES.length);
  const prefixes = PAGE_ACCESS_RULES.map(({ prefix }) => prefix);
  assert.ok(prefixes.indexOf("/officer/analytics/recommendations") < prefixes.indexOf("/officer/analytics"));
});
