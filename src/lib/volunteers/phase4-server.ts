import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

export function createInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashInvitationEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

export function invitationFailureReason(error: { code?: string; message?: string } | null) {
  if (error?.code === "23514" || /unavailable|expired|capacity|full/i.test(error?.message ?? "")) return "invitation_unavailable";
  if (error?.code === "42501" && /email/i.test(error?.message ?? "")) return "email_ineligible";
  if (error?.code === "42501") return "runtime_denied";
  if (error?.code === "40001") return "stale_conflict";
  if (error?.code === "22023") return "invalid_request";
  return "join_failed";
}

export function phase4Unavailable() {
  return NextResponse.json({ error: "This feature is not enabled." }, { status: 404 });
}

export function phase4DatabaseError(error: { message?: string; code?: string } | null) {
  const conflict = error?.code === "40001" || /stale|capacity|full/i.test(error?.message ?? "");
  const denied = error?.code === "42501";
  return NextResponse.json(
    { error: denied ? "Forbidden" : conflict ? "The record changed. Reload and try again." : (error?.message ?? "Request failed.") },
    { status: denied ? 403 : conflict ? 409 : 400 },
  );
}
