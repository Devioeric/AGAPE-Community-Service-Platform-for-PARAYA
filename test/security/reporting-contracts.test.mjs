import assert from "node:assert/strict";
import test from "node:test";

import { deliveryRuntimeSchema } from "../../src/lib/reporting/contracts.ts";

test("delivery runtime DTO accepts the complete database projection and stays strict", () => {
  const runtime = {
    channel: "email",
    mode: "off",
    providerKey: "disabled",
    rowVersion: 1,
    syntheticUserCount: 0,
    queuedCount: 0,
    failedCount: 0,
    suppressedCount: 0,
  };
  assert.equal(deliveryRuntimeSchema.safeParse(runtime).success, true);
  assert.equal(deliveryRuntimeSchema.safeParse({ ...runtime, unexpected: true }).success, false);
});
