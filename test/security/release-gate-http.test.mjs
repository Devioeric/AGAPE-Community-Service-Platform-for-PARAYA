import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  captureExactCounts,
  createReleaseGateHttpClient,
  diffExactCounts,
  normalizeReleaseGateUrl,
  parseExactCount,
  runSynchronizedRace,
  sanitizeScenarioId,
} from "../../scripts/lib/release-gate-http.mjs";

const anonKey = "synthetic-local-anon-key";

async function withServer(handler, action) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try { return await action(`http://127.0.0.1:${port}`, port); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("release-gate URL accepts only expected loopback HTTP", () => {
  assert.equal(normalizeReleaseGateUrl("http://127.0.0.1:54321", 54321).origin, "http://127.0.0.1:54321");
  assert.throws(() => normalizeReleaseGateUrl("https://example.invalid", 54321), /loopback/);
  assert.throws(() => normalizeReleaseGateUrl("http://127.0.0.1:54322", 54321), /unexpected port/);
});

test("scenario IDs are sanitized and bounded", () => {
  assert.equal(sanitizeScenarioId(" Approve / Return #1 "), "approve-return-1");
  assert.match(sanitizeScenarioId(), /^scenario-[a-f0-9-]+$/);
  assert.throws(() => sanitizeScenarioId("!"), /invalid/);
});

test("synthetic Auth token acquisition is raw and reserved-domain only", async () => {
  await withServer(async (request, response) => {
    assert.equal(request.url, "/auth/v1/token?grant_type=password");
    assert.equal(request.headers.apikey, anonKey);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ access_token: "synthetic-access-token", expires_in: 3600, user: { id: "synthetic-user" } }));
  }, async (apiUrl, port) => {
    const client = createReleaseGateHttpClient({ apiUrl, anonKey, expectedPort: port });
    const auth = await client.signInWithPassword("director@release-gate.invalid", "SyntheticReleaseGateOnly!2026");
    assert.equal(auth.userId, "synthetic-user");
    await assert.rejects(client.signInWithPassword("person@example.com", "password-value"), /reserved synthetic/);
  });
});

test("raw PostgREST, RPC, and Storage requests remain on the local origin", async () => {
  const paths = [];
  await withServer((request, response) => {
    paths.push(request.url);
    response.setHeader("content-type", "application/json");
    response.end("[]");
  }, async (apiUrl, port) => {
    const client = createReleaseGateHttpClient({ apiUrl, anonKey, expectedPort: port });
    await client.postgrest("profiling_cycles?select=id", { accessToken: "synthetic-access-token" });
    await client.rpc("phase1_test_rpc", { expected_version: 1 }, { accessToken: "synthetic-access-token" });
    await client.storage("phase1-documents", "synthetic/object.pdf", { accessToken: "synthetic-access-token" });
  });
  assert.deepEqual(paths, [
    "/rest/v1/profiling_cycles?select=id",
    "/rest/v1/rpc/phase1_test_rpc",
    "/storage/v1/object/phase1-documents/synthetic/object.pdf",
  ]);
});

test("synchronized races retain task order and contain failures", async () => {
  const results = await runSynchronizedRace([async () => "winner", async () => { throw new Error("stale conflict"); }]);
  assert.deepEqual(results.map(({ index, status }) => ({ index, status })), [{ index: 0, status: "fulfilled" }, { index: 1, status: "rejected" }]);
  assert.equal(results[1].error, "stale conflict");
});

test("exact count helpers capture and diff before/after state", async () => {
  assert.equal(parseExactCount("0-0/7"), 7);
  assert.equal(parseExactCount("*/0"), 0);
  const client = { postgrest: async (path) => ({ ok: true, status: 200, count: path.startsWith("events") ? 4 : 2 }) };
  const counts = await captureExactCounts(client, ["events", "records"], "synthetic-access-token");
  assert.deepEqual(counts, { events: 4, records: 2 });
  assert.deepEqual(diffExactCounts({ events: 3, records: 2 }, counts), { events: 1, records: 0 });
});
