import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { isolatedChildEnvironment, redactProcessOutput, runProcess } from "./lib/local-database-gate.mjs";
import { createReleaseGateHttpClient } from "./lib/release-gate-http.mjs";

const PASSWORD = "SyntheticReleaseGateOnly!2026";
const ACTIVE_SYNTHETIC_IDS = [
  ...Array.from({ length: 9 }, (_, index) => `f2200000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  ...Array.from({ length: 14 }, (_, index) => `f2200000-0000-4000-8000-${String(index + 13).padStart(12, "0")}`),
];
const PARTNERS = [
  "f3100000-0000-4000-8000-000000000001", "f3100000-0000-4000-8000-000000000002",
  "f3100000-0000-4000-8000-000000000003", "f3100000-0000-4000-8000-000000000004",
  "f3100000-0000-4000-8000-000000000005", "f3100000-0000-4000-8000-000000000007",
  "f3100000-0000-4000-8000-000000000008", "f3100000-0000-4000-8000-000000000009",
  "f3100000-0000-4000-8000-00000000000a", "f3100000-0000-4000-8000-00000000000b",
  "f3100000-0000-4000-8000-00000000000c",
];
const COMPONENTS = ["partners", "historical_programs", "proposals", "program_finance", "external_contact_email"];

export function phase2BrowserGateContract() {
  return { schema: "agape.phase2-browser-gates.v1", cases: 6, aiRequests: 3, finalState: { phase2Modes: "off", partnerMutationAuthority: "v1", proposalMutationAuthority: "v1" } };
}

async function startAiRecorder() {
  const requests = [];
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions" || request.headers.authorization !== "Bearer synthetic-phase2-ai-key") {
      response.writeHead(404).end(); return;
    }
    const chunks = []; let bytes = 0;
    request.on("data", (chunk) => { bytes += chunk.length; if (bytes <= 1024 * 1024) chunks.push(chunk); });
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
  await new Promise((resolvePromise, reject) => { server.once("error", reject); server.listen(3111, "127.0.0.1", resolvePromise); });
  return { requests, close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())) };
}

function assertPhase2SafeAiPayloads(requests) {
  const contract = phase2BrowserGateContract();
  assert.equal(requests.length, contract.aiRequests, "Phase 2 AI recorder request count drifted");
  const serialized = JSON.stringify(requests).toLowerCase();
  for (const forbidden of [
    "synthetic primary contact", "contact@release-gate.invalid", "former-contact@release-gate.invalid",
    "aggregate-only synthetic history", "synthetic allocation", "synthetic materials", "synthetic-receipt.pdf",
    "storage_path", "receipt_document_id", "partner_contacts", "historical_need_description",
  ]) assert.ok(!serialized.includes(forbidden), `AI payload leaked prohibited Phase 2 material: ${forbidden}`);
  assert.ok(serialized.includes("budget review summary"), "AI budget context did not use the aggregate-only contract");
  for (const request of requests) {
    assert.equal(request.model, "synthetic-recording-model");
    assert.ok(Array.isArray(request.messages) && request.messages.length > 0, "AI request omitted its bounded message contract");
  }
}

async function waitForServer(baseUrl, server) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (server.exitCode !== null) throw new Error("Next.js Phase 2 browser-gate server exited before becoming ready");
    try { const response = await fetch(`${baseUrl}/login`, { redirect: "manual" }); if (response.status < 500) return; }
    catch { /* startup */ }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error("Next.js Phase 2 browser-gate server did not become ready");
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => server.once("exit", resolvePromise)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Next.js Phase 2 browser-gate server did not stop cleanly")), 10_000)),
  ]);
}

export async function runPhase2BrowserGates({ root, apiUrl, anonKey, serviceRoleKey, readWorkflowFingerprint, expectedPort = 54321 }) {
  assert.ok(typeof serviceRoleKey === "string" && serviceRoleKey.length >= 20, "local disposable service-role key is unavailable");
  assert.equal(typeof readWorkflowFingerprint, "function", "a fixed workflow fingerprint reader is required");
  const client = createReleaseGateHttpClient({ apiUrl, anonKey, expectedPort });
  const directorToken = (await client.signInWithPassword("director@release-gate.invalid", PASSWORD)).accessToken;
  const configure = async (component, mode, entityIds = [], implementationDate = null) => {
    const result = await client.rpc("phase2_configure_component", {
      p_component: component, p_mode: mode,
      p_synthetic_user_ids: mode === "synthetic" ? ACTIVE_SYNTHETIC_IDS : [],
      p_synthetic_entity_ids: mode === "synthetic" ? entityIds : [],
      p_implementation_date: implementationDate, p_configuration: {},
    }, { accessToken: directorToken });
    assert.ok(result.ok, `${component} browser configuration failed (${result.status}/${result.data?.code ?? "none"})`);
  };
  const setV1 = async (component) => {
    const result = await client.rpc("phase2_set_cutover_authority", { p_component: component, p_authority: "v1", p_reconciliation_hash: "e".repeat(64) }, { accessToken: directorToken });
    assert.ok(result.ok, `${component} V1 restore failed`);
  };

  const aiRecorder = await startAiRecorder();
  const baseUrl = "http://127.0.0.1:3101";
  const next = resolve(root, "node_modules", "next", "dist", "bin", "next");
  const playwright = resolve(root, "node_modules", "@playwright", "test", "cli.js");
  const baseEnv = isolatedChildEnvironment();
  Object.assign(baseEnv, {
    NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey, AGAPE_PROFILING_V2_ENABLED: "false",
    AGAPE_PARTNER_REGISTRY_V2_ENABLED: "false", AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED: "false",
    AGAPE_PROPOSALS_V2_ENABLED: "false", AGAPE_PROGRAM_FINANCE_V2_ENABLED: "false",
    AGAPE_EXTERNAL_CONTACT_EMAIL_ENABLED: "false", AGAPE_PHASE2_E2E: "true", PLAYWRIGHT_BASE_URL: baseUrl,
    LOCAL_AI_BASE_URL: "http://127.0.0.1:3111/v1", LOCAL_AI_API_KEY: "synthetic-phase2-ai-key", LOCAL_AI_MODEL: "synthetic-recording-model",
  });
  const build = await runProcess(process.execPath, [next, "build"], { cwd: root, env: baseEnv, timeoutMs: 480_000 });
  if (build.code !== 0 || build.truncated) throw new Error(`Phase 2 local browser build failed:\n${build.stderr || build.stdout}`);

  const scenarios = [
    { name: "partners", modes: [["partners", PARTNERS]], flags: { AGAPE_PARTNER_REGISTRY_V2_ENABLED: "true" } },
    { name: "historical_programs", modes: [["historical_programs", ["f3200000-0000-4000-8000-000000000001", "f3200000-0000-4000-8000-000000000002"], "2026-01-01"]], flags: { AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED: "true" } },
    { name: "proposals", modes: [["proposals", ["f3310000-0000-4000-8000-000000000001"]]], flags: { AGAPE_PROPOSALS_V2_ENABLED: "true" } },
    { name: "program_finance", modes: [["program_finance", ["f3320000-0000-4000-8000-000000000001"]]], flags: { AGAPE_PROGRAM_FINANCE_V2_ENABLED: "true" } },
    { name: "barangay_scope", modes: [["partners", PARTNERS], ["historical_programs", ["f3200000-0000-4000-8000-000000000001", "f3200000-0000-4000-8000-000000000002"], "2026-01-01"]], flags: { AGAPE_PARTNER_REGISTRY_V2_ENABLED: "true", AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED: "true" } },
    { name: "ai_privacy", modes: [], flags: {} },
  ];

  let passed = 0; let workflowBefore; let operationError;
  try {
    workflowBefore = await readWorkflowFingerprint();
    for (const scenario of scenarios) {
      for (const [component, entities, implementationDate] of scenario.modes) await configure(component, "synthetic", entities, implementationDate ?? null);
      const env = { ...baseEnv, ...scenario.flags, AGAPE_PHASE2_E2E_COMPONENT: scenario.name };
      let server; let serverOutput = ""; let scenarioError;
      try {
        server = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", "3101"], { cwd: root, env, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
        server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-32_768); });
        server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-32_768); });
        await waitForServer(baseUrl, server);
        const browser = await runProcess(process.execPath, [playwright, "test", "e2e/phase2-authenticated.spec.ts", "--project=chromium", "--workers=1", "--reporter=line"], { cwd: root, env, timeoutMs: 240_000 });
        if (browser.code !== 0 || browser.truncated) throw new Error(`Phase 2 ${scenario.name} browser gate failed:\n${browser.stdout}\n${browser.stderr}\n${redactProcessOutput(serverOutput)}`);
        const passedMatch = browser.stdout.match(/(\d+) passed/);
        assert.equal(Number(passedMatch?.[1] ?? 0), 1, `${scenario.name} browser case count drifted`);
        passed += 1;
      } catch (error) { scenarioError = error; throw error; }
      finally {
        try { await stopServer(server); }
        catch (cleanupError) { if (!scenarioError) throw cleanupError; }
        for (const [component] of [...scenario.modes].reverse()) await configure(component, "off");
      }
    }
    assertPhase2SafeAiPayloads(aiRecorder.requests);
    assert.deepEqual(await readWorkflowFingerprint(), workflowBefore, "Phase 2 browser/AI execution changed proposal or program workflow state");
    const contract = phase2BrowserGateContract(); assert.equal(passed, contract.cases);
    return { schema: contract.schema, passed, failed: 0, skipped: 0, finalState: contract.finalState };
  } catch (error) { operationError = error; throw error; }
  finally {
    for (const component of COMPONENTS) { try { await configure(component, "off"); } catch { /* preserve original error */ } }
    try { await setV1("partners"); await setV1("proposals"); } catch { /* preserve original error */ }
    let recorderError;
    try { await aiRecorder.close(); } catch (error) { recorderError = error; }
    for (const component of COMPONENTS) {
      const state = await client.rpc("phase2_get_readiness", { p_component: component }, { accessToken: directorToken });
      assert.ok(state.ok && state.data?.mode === "off", `${component} browser gate final off-state proof failed`);
    }
    if (recorderError && !operationError) throw recorderError;
  }
}
