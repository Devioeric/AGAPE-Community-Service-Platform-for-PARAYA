import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_CALLBACK_DEFAULT_PATH,
  isRecentPasswordRecovery,
  sanitizeAuthCallbackNext,
} from "../../src/lib/auth/redirects.ts";
import {
  classifyApiAccess,
  isPendingInvitedAccount,
} from "../../src/lib/auth/request-access.ts";

test("auth callback redirects use an exact internal allowlist", () => {
  assert.equal(sanitizeAuthCallbackNext("/reset-password"), "/reset-password");
  for (const unsafe of [
    "https://evil.example/reset-password",
    "//evil.example/reset-password",
    "/reset-password?next=https://evil.example",
    "/reset-password/../admin",
    "/%2f%2fevil.example",
    null,
  ]) {
    assert.equal(sanitizeAuthCallbackNext(unsafe), AUTH_CALLBACK_DEFAULT_PATH);
  }
});

test("password recovery timestamps must be recent and parseable", () => {
  const now = Date.parse("2026-08-16T10:00:00.000Z");
  assert.equal(isRecentPasswordRecovery("2026-08-16T09:30:00.000Z", now), true);
  assert.equal(isRecentPasswordRecovery("2026-08-16T08:00:00.000Z", now), false);
  assert.equal(isRecentPasswordRecovery("not-a-date", now), false);
  assert.equal(isRecentPasswordRecovery(null, now), false);
});

test("application APIs are protected by default", () => {
  assert.equal(classifyApiAccess("/login"), "not_api");
  assert.equal(classifyApiAccess("/api/auth/signup"), "public");
  assert.equal(classifyApiAccess("/api/auth/signup/anything"), "protected");
  assert.equal(classifyApiAccess("/api/cron/profiling-reminder"), "public");
  assert.equal(
    classifyApiAccess("/api/v2/finance-integrity/verify/00000000-0000-4000-8000-000000000001"),
    "public",
  );
  assert.equal(classifyApiAccess("/api/v2/finance-integrity/verify"), "protected");
  assert.equal(classifyApiAccess("/api/auth/accept-invite"), "invite_completion");
  assert.equal(classifyApiAccess("/api/auth/signout"), "protected");
  assert.equal(classifyApiAccess("/api/proposals"), "protected");
});

test("invite completion requires an invited pending inactive identity", () => {
  const invitedAt = "2026-08-16T09:00:00.000Z";
  assert.equal(
    isPendingInvitedAccount(invitedAt, { status: "pending", is_active: false }),
    true,
  );
  assert.equal(
    isPendingInvitedAccount(null, { status: "pending", is_active: false }),
    false,
  );
  assert.equal(
    isPendingInvitedAccount(invitedAt, { status: "active", is_active: true }),
    false,
  );
});
