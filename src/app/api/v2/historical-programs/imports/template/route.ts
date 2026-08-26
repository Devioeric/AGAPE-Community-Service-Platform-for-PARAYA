import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { buildHistoricalCsvTemplate, buildHistoricalTemplate } from "@/lib/phase2/historical-import";
import { isPhase2ComponentEnabled, phase2DisabledResponse } from "@/lib/phase2/feature";

export async function GET(request: Request) {
  const auth = await authorizeCapability("historical_program.import");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
  if (["programs_csv", "sdgs_csv", "needs_csv"].includes(format)) {
    const kind = format.replace("_csv", "") as "programs" | "sdgs" | "needs";
    return new NextResponse(buildHistoricalCsvTemplate(kind), { headers: { "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="agape-historical-${kind}-v2.csv"`, "cache-control": "no-store" } });
  }
  if (format !== "xlsx") return NextResponse.json({ error: "Unknown template format" }, { status: 400 });
  const bytes = buildHistoricalTemplate();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new NextResponse(body, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": 'attachment; filename="agape-historical-programs-v2.xlsx"', "cache-control": "no-store" } });
}
