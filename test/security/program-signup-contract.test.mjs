import assert from "node:assert/strict";
import test from "node:test";

import {
  isProgramSignupUuid,
  parseProgramSignupRequestBody,
} from "../../src/lib/programs/signup-contract.ts";

const volunteerId = "11111111-1111-4111-8111-111111111111";

test("empty signup bodies safely mean volunteer self-signup", () => {
  assert.deepEqual(parseProgramSignupRequestBody(""), {
    ok: true,
    volunteerId: null,
  });
  assert.deepEqual(parseProgramSignupRequestBody("   \r\n"), {
    ok: true,
    volunteerId: null,
  });
  assert.deepEqual(parseProgramSignupRequestBody("{}"), {
    ok: true,
    volunteerId: null,
  });
});

test("the optional PARAYA assignment target is strict", () => {
  assert.deepEqual(
    parseProgramSignupRequestBody(JSON.stringify({ volunteer_id: volunteerId })),
    { ok: true, volunteerId },
  );
  assert.equal(isProgramSignupUuid(volunteerId), true);
  assert.equal(parseProgramSignupRequestBody("not-json").ok, false);
  assert.equal(parseProgramSignupRequestBody("null").ok, false);
  assert.equal(parseProgramSignupRequestBody("[]").ok, false);
  assert.equal(
    parseProgramSignupRequestBody(JSON.stringify({ volunteer_id: "not-a-uuid" })).ok,
    false,
  );
  assert.equal(
    parseProgramSignupRequestBody(JSON.stringify({ status: "confirmed" })).ok,
    false,
  );
});
