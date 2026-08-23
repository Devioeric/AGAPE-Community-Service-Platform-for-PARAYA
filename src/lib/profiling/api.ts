import { NextResponse } from "next/server";

export function profilingDisabledResponse() {
  return NextResponse.json(
    { error: "Resident profiling is disabled until privacy and deployment gates are complete", code: "profiling_disabled" },
    { status: 503 },
  );
}

export function profilingRpcError(error: { message?: string; code?: string } | null) {
  const code = error?.code;
  const status = code === "42501" ? 403 : code === "P0002" ? 404 : code === "40001" ? 409 : code === "22023" || code === "23514" ? 422 : 500;
  return NextResponse.json({ error: error?.message ?? "Profiling operation failed" }, { status });
}
