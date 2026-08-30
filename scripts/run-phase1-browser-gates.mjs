import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { isolatedChildEnvironment, redactProcessOutput, runProcess } from "./lib/local-database-gate.mjs";
import { createReleaseGateHttpClient } from "./lib/release-gate-http.mjs";

const PASSWORD = "SyntheticReleaseGateOnly!2026";
const ALPHA = "f2100000-0000-4000-8000-000000000001";
const BETA = "f2100000-0000-4000-8000-000000000002";
const ACTIVE_SYNTHETIC_IDS = [
  "f2200000-0000-4000-8000-000000000001", "f2200000-0000-4000-8000-000000000002",
  "f2200000-0000-4000-8000-000000000003", "f2200000-0000-4000-8000-000000000004",
  "f2200000-0000-4000-8000-000000000005", "f2200000-0000-4000-8000-000000000006",
  "f2200000-0000-4000-8000-000000000007", "f2200000-0000-4000-8000-000000000008",
  "f2200000-0000-4000-8000-000000000009", "f2200000-0000-4000-8000-000000000013",
  "f2200000-0000-4000-8000-000000000014", "f2200000-0000-4000-8000-000000000015",
  "f2200000-0000-4000-8000-000000000016", "f2200000-0000-4000-8000-000000000017",
  "f2200000-0000-4000-8000-000000000018", "f2200000-0000-4000-8000-000000000019",
];

export function phase1BrowserGateContract() {
  return { schema: "agape.phase1-browser-gates.v2", cases: 10, aiRequests: 1, workers: 1, finalState: { profilingMode: "off" } };
}

async function startAiRecorder() {
  const requests = [];
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions" || request.headers.authorization !== "Bearer synthetic-local-ai-key") {
      response.writeHead(404).end(); return;
    }
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes <= 1024 * 1024) chunks.push(chunk);
    });
    request.on("end", () => {
      if (bytes > 1024 * 1024) { response.writeHead(413).end(); return; }
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { response.writeHead(400).end(); return; }
      requests.push(payload);
      if (payload.stream === true) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write('data: {"choices":[{"delta":{"content":"Synthetic advisory response"}}]}\n\n');
        response.end("data: [DONE]\n\n");
      } else {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content: "Synthetic advisory narrative" } }] }));
      }
    });
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(3110, "127.0.0.1", resolvePromise);
  });
  return {
    requests,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

function assertPrivateAiPayloads(requests, expectedCount) {
  assert.equal(requests.length, expectedCount, "AI recorder request count drifted");
  const serialized = JSON.stringify(requests).toLowerCase();
  for (const forbidden of [
    "synthetic adult", "synthetic minor", "syna-res-", "syna-hh-", "f2720000-",
    "first_name", "last_name", "birth_date", "contact_number", "landmark",
    "resident_code", "household_code", "profiling_resident_versions", "raw profile",
  ]) assert.ok(!serialized.includes(forbidden), `AI payload leaked prohibited profiling material: ${forbidden}`);
  for (const request of requests) {
    assert.equal(request.model, "synthetic-recording-model");
    assert.ok(Array.isArray(request.messages) && request.messages.length > 0, "AI request omitted its bounded message contract");
  }
}

async function waitForServer(baseUrl, server) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (server.exitCode !== null) throw new Error("Next.js browser-gate server exited before becoming ready");
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch { /* server is still starting */ }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error("Next.js browser-gate server did not become ready on the loopback endpoint");
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => server.once("exit", resolvePromise)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Next.js browser-gate server did not stop cleanly")), 10_000)),
  ]);
}

async function clearDisposableMailpit() {
  const origin = "http://127.0.0.1:54324";
  const removed = await fetch(`${origin}/api/v1/messages`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.ok(removed.ok, "disposable Mailpit cleanup failed");
  const listed = await fetch(`${origin}/api/v1/messages?start=0&limit=1`, { cache: "no-store" });
  assert.ok(listed.ok, "disposable Mailpit cleanup verification failed");
  const state = await listed.json();
  assert.equal(state?.total, 0, "disposable Mailpit retained stale one-time links");
}

export async function runPhase1BrowserGates({ root, apiUrl, anonKey, serviceRoleKey, readWorkflowFingerprint, expectedPort = 54321 }) {
  assert.equal(typeof serviceRoleKey, "string", "local disposable service-role key is unavailable");
  assert.ok(serviceRoleKey.length >= 20, "local disposable service-role key is malformed");
  assert.equal(typeof readWorkflowFingerprint, "function", "a fixed workflow fingerprint reader is required");
  const client = createReleaseGateHttpClient({ apiUrl, anonKey, expectedPort });
  const directorToken = (await client.signInWithPassword("director@release-gate.invalid", PASSWORD)).accessToken;
  const entered = await client.rpc("phase1_set_profiling_runtime", {
    p_mode: "synthetic", p_synthetic_user_ids: ACTIVE_SYNTHETIC_IDS,
    p_synthetic_barangay_ids: [ALPHA, BETA], p_privacy_approved: false,
  }, { accessToken: directorToken });
  assert.ok(entered.ok && entered.data?.mode === "synthetic", "browser gate could not enter disposable synthetic mode");

  // Next.js canonicalizes route-handler redirects to localhost in this local
  // production server. Keep the browser origin consistent so PKCE cookies are
  // not stranded on 127.0.0.1 during password recovery.
  const baseUrl = "http://localhost:3100";
  await clearDisposableMailpit();
  const aiRecorder = await startAiRecorder();
  let workflowBefore;
  const env = isolatedChildEnvironment();
  Object.assign(env, {
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    AGAPE_PROFILING_V2_ENABLED: "true",
    AGAPE_PARTNER_REGISTRY_V2_ENABLED: "false",
    AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED: "false",
    AGAPE_PROPOSALS_V2_ENABLED: "false",
    AGAPE_PROGRAM_FINANCE_V2_ENABLED: "false",
    AGAPE_EXTERNAL_CONTACT_EMAIL_ENABLED: "false",
    AGAPE_LEGACY_ACCOUNT_SUSPENSION_ENABLED: "false",
    AGAPE_PHASE1_E2E: "true",
    AGAPE_LOCAL_MAILPIT_URL: "http://127.0.0.1:54324",
    NEXT_PUBLIC_APP_URL: baseUrl,
    PLAYWRIGHT_BASE_URL: baseUrl,
    LOCAL_AI_BASE_URL: "http://127.0.0.1:3110/v1",
    LOCAL_AI_API_KEY: "synthetic-local-ai-key",
    LOCAL_AI_MODEL: "synthetic-recording-model",
  });
  const next = resolve(root, "node_modules", "next", "dist", "bin", "next");
  const playwright = resolve(root, "node_modules", "@playwright", "test", "cli.js");
  let server;
  let operationError;
  try {
    workflowBefore = await readWorkflowFingerprint();
    const build = await runProcess(process.execPath, [next, "build"], { cwd: root, env, timeoutMs: 480_000 });
    if (build.code !== 0 || build.truncated) throw new Error(`Phase 1 local browser build failed:\n${build.stderr || build.stdout}`);
    server = spawn(process.execPath, [next, "start", "-H", "localhost", "-p", "3100"], {
      cwd: root, env, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"],
    });
    let serverOutput = "";
    server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-32_768); });
    server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-32_768); });
    await waitForServer(baseUrl, server);
    const browser = await runProcess(process.execPath, [playwright, "test", "e2e/phase1-authenticated.spec.ts", "--project=chromium", "--workers=1", "--reporter=line"], {
      cwd: root, env, timeoutMs: 360_000,
    });
    if (browser.code !== 0 || browser.truncated) {
      const safeServerOutput = redactProcessOutput(serverOutput);
      throw new Error(`Phase 1 authenticated browser gates failed:\n${browser.stdout}\n${browser.stderr}\n${safeServerOutput}`);
    }
    const contract = phase1BrowserGateContract();
    const passedMatch = browser.stdout.match(/(\d+) passed/);
    assert.equal(Number(passedMatch?.[1] ?? 0), contract.cases, "browser gate case count drifted");
    assertPrivateAiPayloads(aiRecorder.requests, contract.aiRequests);
    assert.deepEqual(await readWorkflowFingerprint(), workflowBefore, "AI/browser execution changed proposal or program workflow state");
    return { schema: contract.schema, passed: contract.cases, failed: 0, skipped: 0, finalState: contract.finalState };
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    let serverCleanupError;
    try { await stopServer(server); }
    catch (cleanupError) { serverCleanupError = cleanupError; }
    let recorderCleanupError;
    try { await aiRecorder.close(); }
    catch (cleanupError) { recorderCleanupError = cleanupError; }
    const off = await client.rpc("phase1_set_profiling_runtime", {
      p_mode: "off", p_synthetic_user_ids: [], p_synthetic_barangay_ids: [], p_privacy_approved: false,
    }, { accessToken: directorToken });
    assert.ok(off.ok && off.data?.mode === "off", "browser gate did not restore profiling mode off");
    const state = await client.rpc("phase1_get_profiling_runtime", {}, { accessToken: directorToken });
    assert.ok(state.ok && state.data?.mode === "off", "browser gate final off-state proof failed");
    if ((serverCleanupError || recorderCleanupError) && !operationError) throw serverCleanupError ?? recorderCleanupError;
  }
}
