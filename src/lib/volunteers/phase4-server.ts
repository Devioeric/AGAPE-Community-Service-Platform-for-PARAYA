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
