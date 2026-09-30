"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";

export const TABLE_PAGE_SIZE = 10;

interface PaginatedTableProps<T> {
  /** Complete, already authorized and filtered result set. Never pass a server page here. */
  rows: readonly T[];
  label: string;
  /** Search/filter/scope identity, not the array reference or selected detail record. */
  resetKey?: string;
  loading?: boolean;
  "aria-label"?: string;
  children: (pageRows: readonly T[], offset: number) => ReactNode;
}

/** Pages records, not DOM rows: an expanded detail stays with its parent record. */
export function PaginatedTable<T>({ rows, label, resetKey = "", loading = false, children, "aria-label": ariaLabel }: PaginatedTableProps<T>) {
  const tableId = useId();
  const [state, setState] = useState({ resetKey, page: 1 });
  const [printing, setPrinting] = useState(false);
  const pageCount = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
  const page = state.resetKey === resetKey ? Math.min(state.page, pageCount) : 1;

  // Reconcile during render so a new filter can never paint the old page first.
  // Also retain the clamped page after a deletion, even if more rows arrive later.
  if (state.resetKey !== resetKey || state.page !== page) setState({ resetKey, page });

  useEffect(() => {
    // ExportMenu's PDF option prints the page. Include all loaded records in print,
    // without changing arrays used by CSV/XLSX, summaries, maps, or charts.
    const beforePrint = () => flushSync(() => setPrinting(true));
    const afterPrint = () => setPrinting(false);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  const offset = (page - 1) * TABLE_PAGE_SIZE;
  const pageRows = printing ? rows : rows.slice(offset, offset + TABLE_PAGE_SIZE);
  return (
    <div className="min-w-0 w-full" data-paginated-table={label} aria-label={ariaLabel} aria-busy={loading}>
      {/* relative: keeps absolutely positioned children (e.g. sr-only header labels) inside the scroll box. */}
      <div id={tableId} className="relative max-w-full overflow-x-auto print:overflow-visible">
        {children(pageRows, printing ? 0 : offset)}
      </div>
      {!loading && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
            Showing {rows.length === 0 ? "0" : `${offset + 1}–${Math.min(offset + TABLE_PAGE_SIZE, rows.length)}`} of {rows.length} {label.toLowerCase()}
          </p>
          <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" aria-controls={tableId}
              aria-label={`Previous ${label.toLowerCase()} page`} disabled={page <= 1}
              onClick={() => setState({ resetKey, page: page - 1 })}>Previous</Button>
            <span className="text-sm text-muted-foreground whitespace-nowrap">Page {page} of {pageCount}</span>
            <Button type="button" variant="outline" size="sm" aria-controls={tableId}
              aria-label={`Next ${label.toLowerCase()} page`} disabled={page >= pageCount}
              onClick={() => setState({ resetKey, page: page + 1 })}>Next</Button>
          </nav>
        </div>
      )}
    </div>
  );
}
