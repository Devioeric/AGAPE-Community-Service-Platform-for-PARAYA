import { NextResponse } from "next/server";

export function profilingDisabledResponse() {
  return NextResponse.json(
    { error: "Resident profiling is disabled until privacy and deployment gates are complete", code: "profiling_disabled" },
    { status: 503 },
  );
}

export function profilingRpcError(error: unknown) {
  const safeError = error && typeof error === "object" ? error as { message?: unknown; code?: unknown } : null;
  const code = typeof safeError?.code === "string" ? safeError.code : undefined;
  const message = typeof safeError?.message === "string" ? safeError.message : "Profiling operation failed";
  const status = code === "42501" ? 403 : code === "P0002" ? 404 : code === "40001" ? 409 : code === "22023" || code === "23514" ? 422 : 500;
  return NextResponse.json({ error: message }, { status });
}
