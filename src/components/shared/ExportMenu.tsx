"use client";

import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportToExcel, exportToCsv, printToPdf } from "@/lib/export";

interface ExportMenuProps<T extends Record<string, unknown>> {
  /** Plain-object rows to export. The key order defines column order. */
  rows:      T[];
  /** Base filename (date stamp is appended automatically). */
  filename:  string;
  /** Optional sheet name for Excel exports (defaults to filename). */
  sheetName?: string;
  /** Show only the icon (compact mode). */
  compact?:  boolean;
  /** Disable the menu entirely. */
  disabled?: boolean;
}

export function ExportMenu<T extends Record<string, unknown>>({
  rows, filename, sheetName, compact = false, disabled = false,
}: ExportMenuProps<T>) {
  const isEmpty = rows.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || isEmpty}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-2 border-border print-hidden"
        )}
      >
        <Download className="w-4 h-4" />
        {!compact && "Export"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onClick={() => exportToExcel(rows as any, filename, sheetName ?? filename)}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-success" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onClick={() => exportToCsv(rows as any, filename)}
        >
          <FileText className="w-3.5 h-3.5 text-muted-foreground" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onClick={() => printToPdf()}
        >
          <Printer className="w-3.5 h-3.5 text-info" /> Save as PDF (print)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
