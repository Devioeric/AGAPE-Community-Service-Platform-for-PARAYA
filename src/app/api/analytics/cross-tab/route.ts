import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Legacy household cross-tabs are unavailable. Use approved cycle profiling analytics with privacy suppression.", code: "legacy_analytics_retired" },
    { status: 410 },
  );
}
