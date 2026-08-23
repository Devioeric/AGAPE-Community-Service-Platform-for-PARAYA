import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePublicSignupBody,
  PUBLIC_SIGNUP_ROLE,
} from "../../src/lib/auth/public-signup.ts";
import {
  INACTIVE_AUTH_BAN_DURATION,
  isActiveAccount,
} from "../../src/lib/auth/account-status.ts";
import {
  ADMIN_ASSIGNABLE_LOGIN_ROLES,
  isAdminAssignableLoginRole,
} from "../../src/lib/auth/provisioning.ts";

const validSignup = {
  fullName: "  Juan Dela Cruz  ",
  email: "  JUAN@DYCI.EDU.PH  ",
  password: "correct horse battery staple",
};

test("public registration is server-fixed to Volunteer", () => {
  assert.equal(PUBLIC_SIGNUP_ROLE, "volunteer");

  for (const role of [
    "admin",
    "paraya_director",
    "paraya_associate",
    "paraya_researcher",
    "finance_officer",
    "barangay_captain",
    "barangay_secretary",
    "barangay_mother_leader",
    "office",
    "student_org",
    "department",
  ]) {
    const parsed = parsePublicSignupBody({ ...validSignup, role });
    assert.equal(parsed.ok, false, `public signup must reject ${role}`);
  }
});

test("public registration accepts and normalizes only its safe fields", () => {
  const parsed = parsePublicSignupBody({
    ...validSignup,
    role: "volunteer",
    status: "active",
    is_active: true,
    permissions: { admin: true },
  });

  assert.deepEqual(parsed, {
    ok: true,
    value: {
      fullName: "Juan Dela Cruz",
      email: "juan@dyci.edu.ph",
      password: validSignup.password,
    },
  });
});

test("invalid public signup bodies fail closed", () => {
  for (const value of [
    null,
    [],
    {},
    { ...validSignup, fullName: "J" },
    { ...validSignup, email: "not-an-email" },
    { ...validSignup, password: "short" },
  ]) {
    assert.equal(parsePublicSignupBody(value).ok, false);
  }
});

test("an application account is active only when both state fields agree", () => {
  assert.equal(isActiveAccount({ status: "active", is_active: true }), true);
  assert.equal(isActiveAccount({ status: "active", is_active: false }), false);
  assert.equal(isActiveAccount({ status: "pending", is_active: true }), false);
  assert.equal(isActiveAccount({ status: "suspended", is_active: true }), false);
  assert.equal(isActiveAccount(undefined), false);
  assert.match(INACTIVE_AUTH_BAN_DURATION, /^\d+h$/);
});

test("administrator provisioning includes only the nine approved login categories except Admin itself", () => {
  assert.deepEqual(ADMIN_ASSIGNABLE_LOGIN_ROLES, [
    "paraya_director",
    "paraya_associate",
    "paraya_researcher",
    "finance_officer",
    "barangay_captain",
    "barangay_secretary",
    "barangay_mother_leader",
    "volunteer",
  ]);

  for (const role of ADMIN_ASSIGNABLE_LOGIN_ROLES) {
    assert.equal(isAdminAssignableLoginRole(role), true);
  }
  for (const role of ["admin", "office", "student_org", "department", "paraya_officer"]) {
    assert.equal(isAdminAssignableLoginRole(role), false);
  }
});
