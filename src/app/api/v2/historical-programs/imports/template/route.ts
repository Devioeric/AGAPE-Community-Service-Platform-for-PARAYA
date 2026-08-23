import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { buildHistoricalTemplate } from "@/lib/phase2/historical-import";
import { isPhase2ComponentEnabled, phase2DisabledResponse } from "@/lib/phase2/feature";

export async function GET() {
  const auth = await authorizeCapability("historical_program.import");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const bytes = buildHistoricalTemplate();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new NextResponse(body, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": 'attachment; filename="agape-historical-programs-v2.xlsx"', "cache-control": "no-store" } });
}
