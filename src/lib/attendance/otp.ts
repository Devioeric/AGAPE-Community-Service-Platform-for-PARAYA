// One-time-password helpers for attendance verification.
//
// OTPs are 6 characters from an unambiguous alphabet (no O/0/I/1/L) so they
// can be read aloud or transcribed without confusion. They rotate per activity
// — the officer presses "Rotate" to invalidate the previous code.

import { randomBytes } from "crypto";

// 30 characters; deliberately omits 0, O, 1, I, L to avoid misreading.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Generate a cryptographically random 6-char OTP. */
export function generateOtp(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Default OTP lifetime: 4 hours (long enough for a typical activity window). */
export const OTP_TTL_MS = 4 * 60 * 60 * 1000;

/** True when the OTP record is non-empty, unexpired, and matches the input. */
export function isOtpValid(
  storedOtp:  string | null | undefined,
  storedExp:  string | null | undefined,
  inputOtp:   string,
): boolean {
  if (!storedOtp || !storedExp) return false;
  if (storedOtp.toUpperCase() !== inputOtp.trim().toUpperCase()) return false;
  return new Date(storedExp).getTime() > Date.now();
}
