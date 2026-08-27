import assert from "node:assert/strict";
import test from "node:test";
import {
  proposalValidationEvidencePath,
  validateProposalValidationEvidence,
} from "../../src/lib/proposals/validation-evidence.ts";

test("proposal validation evidence verifies signatures and sanitizes names", () => {
  const bytes = new TextEncoder().encode("%PDF-1.7 synthetic evidence");
  const file = new File([bytes], "minutes/../unsafe?.pdf", { type: "application/pdf" });
  const result = validateProposalValidationEvidence(file, bytes);
  assert.equal(result.extension, "pdf");
  assert.equal(result.safeOriginalName, "minutes_.._unsafe_.pdf");
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    proposalValidationEvidencePath("00000000-0000-4000-8000-000000000001", result.extension, result.sha256),
    `validations/00000000-0000-4000-8000-000000000001/${result.sha256}.pdf`,
  );
});

test("proposal validation evidence rejects MIME spoofing and empty files", () => {
  const spoofed = new TextEncoder().encode("not a pdf");
  assert.throws(
    () => validateProposalValidationEvidence(new File([spoofed], "fake.pdf", { type: "application/pdf" }), spoofed),
    /signature does not match/,
  );
  assert.throws(
    () => validateProposalValidationEvidence(new File([], "empty.pdf", { type: "application/pdf" }), new Uint8Array()),
    /between 1 byte and 10 MB/,
  );
});
