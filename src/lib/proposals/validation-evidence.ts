import { createHash } from "node:crypto";

export const VALIDATION_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

function ascii(bytes: Uint8Array, start: number, end: number) {
  return new TextDecoder().decode(bytes.slice(start, end));
}

function signatureMatches(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "application/pdf") return ascii(bytes, 0, 5) === "%PDF-";
  if (mimeType === "image/png") {
    return bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  }
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/webp") return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  if (mimeType === "image/gif") return ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6));
  if (mimeType === "image/heic") {
    return ascii(bytes, 4, 8) === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(ascii(bytes, 8, 12));
  }
  if (mimeType === "audio/mpeg") {
    return ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  if (mimeType === "audio/mp4") return ascii(bytes, 4, 8) === "ftyp";
  if (mimeType === "audio/wav") return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE";
  if (mimeType === "audio/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

export function validateProposalValidationEvidence(file: File, bytes: Uint8Array) {
  if (file.size < 1 || file.size > VALIDATION_EVIDENCE_MAX_BYTES || file.size !== bytes.byteLength) {
    throw new Error("Evidence must be between 1 byte and 10 MB");
  }
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension) throw new Error("Unsupported evidence MIME type");
  if (!signatureMatches(file.type, bytes)) throw new Error("Evidence signature does not match its MIME type");

  const safeOriginalName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 180) || `evidence.${extension}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { extension, safeOriginalName, sha256 };
}

export function proposalValidationEvidencePath(validationId: string, extension: string, sha256: string) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("Invalid evidence hash");
  return `validations/${validationId}/${sha256}.${extension}`;
}
