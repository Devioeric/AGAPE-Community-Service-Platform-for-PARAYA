"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import { EmptyState, LoadingBlock } from "@/components/shared/RecordUi";
import { FollowUpCount, TableCard, formatImpactDate, tableHeadClass, thClass } from "@/components/impact/ImpactUi";
import type { BarangayImpactSummary } from "@/lib/impact/summary";

type Row = BarangayImpactSummary & { profileRecorded: boolean };

/** One row per barangay: programs measured, people reached, stories, follow-ups, and flagged programs. */
export default function BarangayImpactList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch("/api/impact/barangays", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Barangay impact is temporarily unavailable."))))
      .then((payload) => setRows(payload.data ?? []))
      .catch((failure) => setError(failure instanceof Error ? failure.message : "Barangay impact is temporarily unavailable."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && rows.length === 0) return <LoadingBlock label="Loading barangay impact" />;
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p>{error}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={load}>Retry</Button>
      </div>
    );
  }
  if (rows.length === 0) return <EmptyState title="No barangays yet">Add partner barangays in Partnership Management to see their impact here.</EmptyState>;

  // Most people reached first; barangays without programs last.
  const sortedRows = rows.slice().sort((a, b) => (b.programs > 0 ? 1 : 0) - (a.programs > 0 ? 1 : 0) || b.reached - a.reached || a.name.localeCompare(b.name));
  return (
    <TableCard>
      <PaginatedTable rows={sortedRows} label="Barangay impact" loading={loading}>
        {(pageRows) => (
          <table aria-label="Barangay impact" className="w-full text-sm">
            <thead>
              <tr className={tableHeadClass}>
                <th className={thClass}>Barangay</th>
                <th className={thClass}>Programs</th>
                <th className={`${thClass} text-right`}>People reached</th>
                <th className={`${thClass} text-right`}>Stories</th>
                <th className={thClass}>Follow-ups</th>
                <th className={thClass}>Needs attention</th>
                <th className={`${thClass} hidden xl:table-cell`}>Last recorded</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.barangayId} className="border-b border-border/60 last:border-0 hover:bg-surface-alt/30">
                  <td className="px-4 py-3">
                    <Link href={`/officer/impact/barangays/${row.barangayId}`} prefetch={false} className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">{row.name}</Link>
                    <p className="text-xs text-muted-foreground">{row.profileRecorded ? "Community profile recorded" : "No community profile yet"}</p>
                  </td>
                  <td className="px-4 py-3">
                    {row.programs === 0 ? <span className="text-muted-foreground">No programs yet</span> : <>
                      <span className="tabular-nums">{row.measuredPrograms} of {row.programs} measured</span>
                      <span className="block text-xs text-muted-foreground">{row.completedPrograms} completed</span>
                    </>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{row.reached.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.stories}</td>
                  <td className="px-4 py-3"><FollowUpCount {...row.followUps} /></td>
                  <td className="px-4 py-3">
                    {row.flaggedPrograms > 0
                      ? <span className="inline-flex whitespace-nowrap rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">{row.flaggedPrograms} program{row.flaggedPrograms === 1 ? "" : "s"}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground xl:table-cell">{formatImpactDate(row.lastRecorded)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PaginatedTable>
    </TableCard>
  );
}
