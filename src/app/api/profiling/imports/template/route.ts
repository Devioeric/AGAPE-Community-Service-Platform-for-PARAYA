import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { HOUSEHOLD_IMPORT_FIELDS, PROFILING_TEMPLATE_VERSION, RESIDENT_IMPORT_FIELDS } from "@/lib/profiling/contracts";

export const runtime = "nodejs";

function csv(headers: string[]) { return `\uFEFF${headers.join(",")}\r\n`; }

export async function GET(request: Request) {
  const auth = await authorizeCapability("profiling.collect");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
  if (format === "household_csv" || format === "resident_csv") {
    const household = format === "household_csv";
    return new Response(csv([...(household ? HOUSEHOLD_IMPORT_FIELDS : RESIDENT_IMPORT_FIELDS)]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="AGAPE-${household ? "Households" : "Residents"}-${PROFILING_TEMPLATE_VERSION}.csv"` } });
  }
  if (format !== "xlsx") return NextResponse.json({ error: "format must be xlsx, household_csv, or resident_csv" }, { status: 400 });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["template_version"],[PROFILING_TEMPLATE_VERSION]]), "Metadata");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[...HOUSEHOLD_IMPORT_FIELDS]]), "Households");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[...RESIDENT_IMPORT_FIELDS]]), "Residents");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="AGAPE-Profiling-${PROFILING_TEMPLATE_VERSION}.xlsx"` } });
}
