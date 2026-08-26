import { randomUUID } from "node:crypto";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const SCENARIO_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

function ensureSecret(value, label) {
  if (typeof value !== "string" || value.length < 8) throw new Error(`${label} is missing`);
  return value;
}

export function normalizeReleaseGateUrl(value, expectedPort) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("release-gate HTTP endpoints must use loopback HTTP");
  }
  if (expectedPort !== undefined && Number(url.port || 80) !== Number(expectedPort)) {
    throw new Error("release-gate HTTP endpoint uses an unexpected port");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function sanitizeScenarioId(value = `scenario-${randomUUID()}`) {
  const normalized = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  if (!SCENARIO_PATTERN.test(normalized)) throw new Error("scenario ID is invalid after sanitization");
  return normalized;
}

function safeRelativePath(path, prefix) {
  if (typeof path !== "string" || !path.startsWith(prefix) || path.includes("..") || path.includes("#")) {
    throw new Error("release-gate request path is invalid");
  }
  const [pathname] = path.split("?", 1);
  if (!pathname.startsWith(prefix)) throw new Error("release-gate request path is invalid");
  return path;
}

async function parseResponse(response) {
  const text = await response.text();
  const contentRange = response.headers.get("content-range");
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return {
    ok: response.ok,
    status: response.status,
    data,
    // Ordinary PostgREST/RPC responses may expose a range with an unknown
    // total (for example `0-3/*`). Only exact-count requests may rely on a
    // numeric total; captureExactCounts continues to reject null below.
    count: contentRange && !/\/\*$/.test(contentRange) ? parseExactCount(contentRange) : null,
    requestId: response.headers.get("x-request-id") ?? null,
  };
}

export function parseExactCount(contentRange) {
  if (contentRange == null) return null;
  const match = String(contentRange).match(/^\d+-\d+\/(\d+)$/) ?? String(contentRange).match(/^\*\/(\d+)$/);
  if (!match) throw new Error("PostgREST did not return a valid exact count");
  return Number(match[1]);
}

export function createReleaseGateHttpClient({ apiUrl, anonKey, expectedPort, fetchImpl = globalThis.fetch }) {
  const root = normalizeReleaseGateUrl(apiUrl, expectedPort);
  const publicKey = ensureSecret(anonKey, "local anon key");
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is unavailable");

  async function request(path, { method = "GET", accessToken, body, headers = {} } = {}) {
    const url = new URL(path, root);
    if (url.origin !== root.origin) throw new Error("cross-origin release-gate request rejected");
    const response = await fetchImpl(url, {
      method,
      headers: {
        apikey: publicKey,
        ...(accessToken ? { Authorization: `Bearer ${ensureSecret(accessToken, "access token")}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseResponse(response);
  }

  return {
    async signInWithPassword(email, password) {
      if (!String(email).endsWith("@release-gate.invalid")) throw new Error("only reserved synthetic identities may authenticate");
      const result = await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
      if (!result.ok || typeof result.data?.access_token !== "string") throw new Error(`synthetic authentication failed (${result.status})`);
      return { accessToken: result.data.access_token, expiresIn: Number(result.data.expires_in ?? 0), userId: result.data.user?.id ?? null };
    },
    postgrest(resourcePath, options = {}) {
      return request(safeRelativePath(`/rest/v1/${resourcePath.replace(/^\/+/, "")}`, "/rest/v1/"), options);
    },
    rpc(functionName, args, options = {}) {
      if (!/^[a-z][a-z0-9_]{1,62}$/.test(functionName)) throw new Error("RPC name is invalid");
      return request(`/rest/v1/rpc/${functionName}`, { ...options, method: "POST", body: args ?? {} });
    },
    storage(bucket, objectPath = "", options = {}) {
      if (!/^[a-z0-9][a-z0-9_-]{2,62}$/.test(bucket)) throw new Error("Storage bucket is invalid");
      const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
      return request(safeRelativePath(`/storage/v1/object/${bucket}/${encoded}`, "/storage/v1/object/"), options);
    },
    storageList(bucket, prefix = "", options = {}) {
      if (!/^[a-z0-9][a-z0-9_-]{2,62}$/.test(bucket)) throw new Error("Storage bucket is invalid");
      return request(`/storage/v1/object/list/${bucket}`, { ...options, method: "POST", body: { prefix, limit: 10, offset: 0 } });
    },
    storageSign(bucket, objectPath, expiresIn, options = {}) {
      if (!/^[a-z0-9][a-z0-9_-]{2,62}$/.test(bucket)) throw new Error("Storage bucket is invalid");
      if (!Number.isInteger(expiresIn) || expiresIn < 1) throw new Error("signed URL expiry is invalid");
      const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
      return request(safeRelativePath(`/storage/v1/object/sign/${bucket}/${encoded}`, "/storage/v1/object/sign/"), { ...options, method: "POST", body: { expiresIn } });
    },
  };
}

export async function runSynchronizedRace(tasks) {
  if (!Array.isArray(tasks) || tasks.length < 2 || tasks.some((task) => typeof task !== "function")) {
    throw new Error("a race requires at least two task functions");
  }
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const runners = tasks.map((task, index) => (async () => {
    await gate;
    try { return { index, status: "fulfilled", value: await task() }; }
    catch (error) { return { index, status: "rejected", error: error instanceof Error ? error.message : "unknown error" }; }
  })());
  release();
  return Promise.all(runners);
}

export async function captureExactCounts(client, resources, accessToken) {
  if (!client || !Array.isArray(resources) || resources.length === 0) throw new Error("count capture requires resources");
  const entries = await Promise.all(resources.map(async (resource) => {
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(resource)) throw new Error("count resource is invalid");
    const result = await client.postgrest(`${resource}?select=id&limit=1`, {
      method: "GET", accessToken, headers: { Prefer: "count=exact", Range: "0-0" },
    });
    if (!result.ok || result.count === null) throw new Error(`exact count failed for ${resource} (${result.status})`);
    return [resource, result.count];
  }));
  return Object.fromEntries(entries);
}

export function diffExactCounts(before, after) {
  const resources = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  return Object.fromEntries(resources.map((resource) => [resource, Number(after?.[resource] ?? 0) - Number(before?.[resource] ?? 0)]));
}
