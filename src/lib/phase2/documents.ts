import { createHash, randomUUID } from "node:crypto";

export const PHASE2_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export type Phase2DocumentKind = "partnership" | "historical" | "proposal_budget" | "program_finance";
export const PHASE2_DOCUMENT_BUCKET: Record<Phase2DocumentKind, string> = {
  partnership: "phase2-partnership-documents", historical: "phase2-historical-evidence",
  proposal_budget: "phase2-proposal-budget-evidence", program_finance: "phase2-program-financial-evidence",
};
const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "image/jpeg": "jpg", "image/png": "png",
};

export function validatePhase2Document(file: File, bytes: Uint8Array) {
  if (file.size < 1 || file.size > PHASE2_DOCUMENT_MAX_BYTES || bytes.byteLength !== file.size) throw new Error("Document must be between 1 byte and 10 MB");
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension) throw new Error("Unsupported document MIME type");
  const signatureValid = file.type === "application/pdf" ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
    : file.type === "image/png" ? bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])
      : file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
        : bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (!signatureValid) throw new Error("Document signature does not match its MIME type");
  const safeOriginalName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 180) || `document.${extension}`;
  return { extension, safeOriginalName, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function generatedDocumentPath(parentId: string, extension: string, sha256?: string) {
  const serverKey = sha256?.match(/^[0-9a-f]{64}$/) ? sha256 : randomUUID();
  return `${parentId}/${serverKey}.${extension}`;
}
