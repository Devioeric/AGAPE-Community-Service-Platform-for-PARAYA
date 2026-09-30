import { NextResponse } from "next/server";

export const privateNoStore = { "cache-control": "private, no-store" } as const;
export const publicNoStore = { "cache-control": "no-store" } as const;
export function integrityRpcError(error: { code?: string } | null, isPublic = false) {
  const status = error?.code === "42501" ? 403 : error?.code === "P0002" ? 404 : ["40001", "23505"].includes(error?.code ?? "") ? 409 : ["22023", "23514"].includes(error?.code ?? "") ? 400 : 503;
  const code = status === 403 ? "integrity_forbidden" : status === 404 ? "integrity_not_found" : status === 409 ? "integrity_conflict" : status === 400 ? "integrity_invalid" : "integrity_unavailable";
  return NextResponse.json({ error: status === 403 ? "This action is not permitted" : status === 404 ? "The integrity proof was not found" : status === 409 ? "The integrity record changed; refresh and try again" : status === 400 ? "The integrity request is invalid" : "Financial integrity is unavailable", code }, { status, headers: isPublic ? publicNoStore : privateNoStore });
}
