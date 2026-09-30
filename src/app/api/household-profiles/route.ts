import { loadLegacyHouseholds } from "@/lib/profiling/legacy-households";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const result = await loadLegacyHouseholds(new URL(request.url).searchParams);
  return NextResponse.json(result.body, { status: result.status, headers: {
    "Cache-Control": "private, no-store", "Server-Timing": result.timing,
  } });
}

export async function POST() {
  return NextResponse.json(
    { error: "Legacy household data is read-only. Use the cycle-aware profiling workflow.", code: "legacy_profile_read_only" },
    { status: 410 },
  );
}
