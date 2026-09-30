// Matches the private activity-photos bucket's format and size policy.
export const ACTIVITY_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACTIVITY_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const ACTIVITY_PHOTO_URL_TTL_SECONDS = 300;

export function activityPhotoExtension(type: string): string | null {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[type] ?? null;
}

/** Reject MIME labels which do not match the file header before Storage. */
export function hasActivityPhotoSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (type === "image/webp") return bytes.length >= 12
    && [82, 73, 70, 70].every((value, index) => bytes[index] === value)
    && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value);
  return false;
}
