export type AttendanceCheckInRequest = { otp: string; method: "otp" | "qr" };

/** No wildcard matching, unknown fields, arbitrary lengths, or manual self-entry. */
export function parseAttendanceCheckIn(value: unknown): AttendanceCheckInRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "otp" && key !== "method")) return null;
  if (typeof body.otp !== "string") return null;
  const otp = body.otp.trim().toUpperCase();
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(otp)) return null;
  if (body.method !== undefined && body.method !== "otp" && body.method !== "qr") return null;
  return { otp, method: body.method === "qr" ? "qr" : "otp" };
}
