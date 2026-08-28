import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  anchorRelayRequestSchema,
  financeIntegrityRequestSchema,
  financeIntegrityRuntimeSchema,
} from "../../src/lib/integrity/contracts.ts";
import { hasCapability } from "../../src/lib/auth/capabilities.ts";

const migration = readFileSync(
  "supabase/migrations/20260818001040_phase5_finance_integrity_foundation.sql",
  "utf8",
);
const provider = readFileSync("src/lib/integrity/provider.ts", "utf8");
const middleware = readFileSync("src/middleware.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");

test("finance integrity contracts reject unknown fields and malformed versions", () => {
  const sourceId = "00000000-0000-4000-8000-000000000001";
  assert.equal(financeIntegrityRequestSchema.safeParse({
    sourceType: "finance_cleared_budget",
    sourceId,
    expectedVersion: 2,
  }).success, true);
  assert.equal(financeIntegrityRequestSchema.safeParse({
    sourceType: "finance_cleared_budget",
    sourceId,
    expectedVersion: 0,
  }).success, false);
  assert.equal(financeIntegrityRequestSchema.safeParse({
    sourceType: "verified_liquidation",
    sourceId,
    expectedVersion: 1,
    receiptPath: "forbidden",
  }).success, false);
});

test("runtime is bounded and defaults stay disabled", () => {
  assert.equal(financeIntegrityRuntimeSchema.safeParse({
    mode: "synthetic",
    syntheticUserIds: [],
    syntheticSourceIds: [],
    providerKey: "synthetic",
    networkKey: "synthetic-local",
    contractReference: null,
  }).success, true);
  assert.equal(financeIntegrityRuntimeSchema.safeParse({
    mode: "live",
    unknown: true,
  }).success, false);
  assert.match(envExample, /^AGAPE_FINANCE_INTEGRITY_V1_ENABLED=false$/m);
  assert.match(envExample, /^AGAPE_BLOCKCHAIN_ANCHOR_PROVIDER=disabled$/m);
  assert.match(migration, /mode text NOT NULL DEFAULT 'off'/);
});

test("Finance and Director can request proofs while Admin only configures the provider", () => {
  assert.equal(hasCapability("finance_officer", {}, "integrity.finance.request"), true);
  assert.equal(hasCapability("paraya_director", {}, "integrity.finance.request"), true);
  assert.equal(hasCapability("admin", {}, "integrity.provider.manage"), true);
  assert.equal(hasCapability("admin", {}, "integrity.finance.read"), false);
  assert.equal(hasCapability("finance_officer", { financial_integrity: false }, "integrity.finance.request"), false);
});

test("relay contract contains only an opaque commitment", () => {
  const parsed = anchorRelayRequestSchema.parse({
    schema: "agape.finance.anchor-request.v1",
    proofId: "00000000-0000-4000-8000-000000000001",
    sourceType: "verified_liquidation",
    sourceVersion: 3,
    canonicalSchema: "agape.finance.verified-liquidation.v1",
    canonicalHash: "a".repeat(64),
  });
  assert.deepEqual(Object.keys(parsed).sort(), [
    "canonicalHash", "canonicalSchema", "proofId", "schema", "sourceType", "sourceVersion",
  ]);
  const outboundBody = provider.slice(
    provider.indexOf("const body = anchorRelayRequestSchema.parse"),
    provider.indexOf("const response = await fetch"),
  );
  assert.doesNotMatch(outboundBody, /description|payee|receipt|contact|documentPath|amount/i);
  assert.match(provider, /idempotency-key/);
  assert.match(provider, /url\.protocol !== "https:"/);
});

test("database boundary freezes hashes and preserves invalidated history", () => {
  assert.match(migration, /agape\.finance\.cleared-budget\.v1/);
  assert.match(migration, /agape\.finance\.verified-liquidation\.v1/);
  assert.match(migration, /source_validity IN\('active','superseded','voided'\)/);
  assert.match(migration, /finance_integrity_events_immutable/);
  assert.match(migration, /source_superseded/);
  assert.match(migration, /source_voided/);
  assert.doesNotMatch(migration, /DELETE FROM public\.finance_integrity_(proofs|events)/);
});

test("new tables are RPC-only and sensitive functions use reviewed grants", () => {
  assert.match(migration, /CREATE POLICY finance_integrity_proofs_rpc_only[\s\S]*USING\(false\) WITH CHECK\(false\)/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.finance_integrity_proofs FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase5_claim_finance_integrity_proofs\(integer,integer\) FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.phase5_claim_finance_integrity_proofs\(integer,integer\) TO service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.phase5_verify_finance_integrity_proof\(uuid\) TO anon,authenticated/);
});

test("public verification is deliberately routed without exposing finance records", () => {
  assert.match(middleware, /"\/verify\/finance"/);
  const route = readFileSync("src/app/api/v2/finance-integrity/verify/[code]/route.ts", "utf8");
  assert.match(route, /phase5_verify_finance_integrity_proof/);
  assert.doesNotMatch(route, /select\(|service_role|createAdminClient/);
});

test("feature description explicitly excludes payment and personal-data workflows", () => {
  const implementation = readFileSync("docs/implementation/phase-5-finance-integrity.md", "utf8");
  assert.match(implementation, /does not move money/i);
  assert.match(implementation, /never receives line-item descriptions, payees, contacts, resident\s+data, receipts/i);
  assert.match(implementation, /blockchain vendor,\s+network, contract, or institutional wallet/i);
});
