import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Phase 2 workspace is role and capability scoped", async () => {
  const workspace = await read("src/components/phase2/Phase2Workspace.tsx");
  assert.match(workspace, /hasCapability\(role, null, capability\)/);
  assert.match(workspace, /PartnerOperations/);
  assert.match(workspace, /HistoricalOperations/);
  assert.match(workspace, /ProposalOperations/);
  assert.match(workspace, /FinanceOperations/);
  assert.doesNotMatch(workspace, /prompt\(|JSON\.stringify\(detail|<pre/);
});

test("operational panels use selectors and versioned responses rather than typed UUID controls", async () => {
  const sources = await Promise.all([
    "PartnerOperations.tsx", "HistoricalOperations.tsx", "ProposalOperations.tsx", "FinanceOperations.tsx",
  ].map((name) => read(`src/components/phase2/${name}`)));
  const joined = sources.join("\n");
  assert.match(joined, /partner-selector/);
  assert.match(joined, /expectedVersion: detail\.rowVersion/);
  assert.match(joined, /expectedVersion: proposal\.proposal\.rowVersion/);
  assert.doesNotMatch(joined, /placeholder=["'][^"']*UUID/i);
  assert.doesNotMatch(joined, /prompt\(/);
});

test("documents are quarantined, signature checked, target reviewed, and downloaded through audited short URLs", async () => {
  const documents = await read("src/lib/phase2/documents.ts");
  const manager = await read("src/components/phase2/DocumentManager.tsx");
  const download = await read("src/app/api/v2/documents/[kind]/[documentId]/route.ts");
  const review = await read("src/app/api/v2/documents/[kind]/[documentId]/review/route.ts");
  const migration = await read("supabase/migrations/20260818000890_phase2_interface_storage_job_completion.sql");
  const readBoundary = await read("supabase/migrations/20260818000750_phase2_document_boundary.sql");
  assert.match(documents, /Document signature does not match its MIME type/);
  assert.match(manager, /uploaded to quarantine/i);
  assert.match(download, /createSignedUrl\(location\.path, 300\)/);
  assert.match(review, /phase2_review_document/);
  assert.match(migration, /phase2\.document\.list/);
  assert.match(readBoundary, /phase2_storage_read_events/);
});

test("contact-email workers claim and finalize only through atomic service RPCs", async () => {
  const worker = await read("src/app/api/cron/phase2-contact-outbox/route.ts");
  const migration = await read("supabase/migrations/20260818000890_phase2_interface_storage_job_completion.sql");
  assert.match(worker, /phase2_claim_contact_email_outbox/);
  assert.match(worker, /phase2_finalize_contact_email/);
  assert.doesNotMatch(worker, /\.from\(["']partner_contact_email_outbox/);
  assert.doesNotMatch(worker, /partner_contacts\(/);
  assert.match(migration, /FOR UPDATE OF o SKIP LOCKED/);
  assert.match(migration, /lease_recovered/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase2_claim_contact_email_outbox\(integer,integer\) FROM PUBLIC,anon,authenticated/);
});

test("email logs exclude recipient addresses and provider response bodies", async () => {
  const email = await read("src/lib/notifications/email.ts");
  assert.doesNotMatch(email, /console\.(?:log|error)[^\n]*msg\.to/);
  assert.doesNotMatch(email, /await res\.text\(|await res\.json\(/);
  assert.match(email, /errorType/);
});
