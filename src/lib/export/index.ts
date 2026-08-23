// Export helpers — Excel (.xlsx), CSV, and browser-print-to-PDF.
//
// Usage:
//   exportToExcel(rows, "audit-log");
//   exportToCsv(rows, "proposals");
//   printToPdf(); // fires window.print() — pair with a print stylesheet.

import * as XLSX from "xlsx";

// ─── Excel ──────────────────────────────────────────────────────────────────

type Row = Record<string, string | number | boolean | null | undefined>;

/**
 * Export an array of plain objects to an .xlsx file.
 * Column order follows the keys of the first row.
 */
export function exportToExcel<T extends Row>(
  rows: T[],
  filename: string,
  sheetName: string = "Sheet1",
): void {
  if (!rows.length) return;
  const ws = makeSheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}-${stamp()}.xlsx`);
}

/**
 * Export a multi-sheet workbook. Each sheet gets its own header row drawn
 * from the keys of its first row. Empty sheets are skipped.
 *
 * Use this for compound rollups (e.g. a per-program analytics export with
 * Activities, Signups, Budget, Indicators, Follow-ups all in one file).
 */
export interface ExcelSheet {
  name: string;
  rows: Row[];
}

export function exportSheetsToExcel(
  sheets: ExcelSheet[],
  filename: string,
): void {
  const nonEmpty = sheets.filter((s) => s.rows.length > 0);
  if (nonEmpty.length === 0) return;

  const wb = XLSX.utils.book_new();
  for (const sheet of nonEmpty) {
    const ws = makeSheet(sheet.rows);
    // Excel sheet names cap at 31 chars and disallow certain punctuation.
    const safeName = sheet.name.slice(0, 31).replace(/[\\/?*[\]]/g, "_");
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  XLSX.writeFile(wb, `${filename}-${stamp()}.xlsx`);
}

// Build a worksheet with auto-sized columns. Shared between single- and
// multi-sheet exporters.
function makeSheet(rows: Row[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const widths = Object.keys(rows[0] ?? {}).map((k) => ({
    wch: Math.min(
      Math.max(
        k.length,
        ...rows.map((r) => String(r[k] ?? "").length),
      ),
      50,
    ),
  }));
  ws["!cols"] = widths;
  return ws;
}

// ─── CSV ────────────────────────────────────────────────────────────────────

export function exportToCsv<T extends Row>(rows: T[], filename: string): void {
  if (!rows.length) return;
  const keys   = Object.keys(rows[0]);
  const header = keys.join(",");
  const body   = rows.map((r) => keys.map((k) => csvEscape(r[k])).join(","));
  const blob   = new Blob([[header, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href     = url;
  a.download = `${filename}-${stamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ─── PDF (via browser print) ────────────────────────────────────────────────

/**
 * Trigger the browser's print dialog. The print stylesheet in globals.css
 * hides chrome (sidebar, header, action buttons) so the resulting PDF shows
 * just the page content.
 */
export function printToPdf(): void {
  window.print();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stamp(): string {
  const d  = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
