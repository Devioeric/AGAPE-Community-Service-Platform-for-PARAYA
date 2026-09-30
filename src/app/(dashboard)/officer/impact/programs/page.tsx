"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import { LoadingBlock } from "@/components/shared/RecordUi";
import {
  FlagBadges, FollowUpCount, ProgramStatusBadge, ReachBar, TableCard,
  filterInputClass, filterSelectClass, formatImpactDate, tableHeadClass, thClass,
} from "@/components/impact/ImpactUi";
import { IMPACT_FLAG_LABEL, type ImpactFlag, type ProgramImpactSummary } from "@/lib/impact/summary";

type Attention = ImpactFlag | "any" | "";
const STATUSES = ["draft", "planning", "upcoming", "active", "completed", "cancelled"];
const isAttention = (value: string | null): value is Exclude<Attention, ""> => value === "any" || (value !== null && value in IMPACT_FLAG_LABEL);

/** One row per program: reach against target, results, stories, follow-ups, and flags. */
export default function ProgramImpactList() {
  const [rows, setRows] = useState<ProgramImpactSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [barangay, setBarangay] = useState("");
  const [status, setStatus] = useState("");
  const [needsOnly, setNeedsOnly] = useState(false);
  const [attention, setAttention] = useState<Attention>("");

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch("/api/impact/programs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Program impact is temporarily unavailable."))))
      .then((payload) => setRows(payload.data ?? []))
      .catch((failure) => setError(failure instanceof Error ? failure.message : "Program impact is temporarily unavailable."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Links from the Overview and barangay reports preset these filters.
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("attention");
    if (isAttention(requested)) setAttention(requested);
    setBarangay(params.get("barangay") ?? "");
    load();
  }, [load]);

  const barangays = useMemo(() => Array.from(new Map(rows.filter((row) => row.barangayId).map((row) => [row.barangayId as string, row.barangayName ?? "Unassigned"])).entries())
    .sort((a, b) => a[1].localeCompare(b[1])), [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => !query || `${row.title} ${row.barangayName ?? ""}`.toLowerCase().includes(query))
      .filter((row) => !barangay || row.barangayId === barangay)
      .filter((row) => !status || row.status === status)
      .filter((row) => !needsOnly || row.flags.length > 0)
      .filter((row) => !attention || (attention === "any" ? row.flags.length > 0 : row.flags.includes(attention)))
      // Flagged programs first, then the most recent start date; undated programs last.
      .sort((a, b) => (b.flags.length > 0 ? 1 : 0) - (a.flags.length > 0 ? 1 : 0) || (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  }, [rows, search, barangay, status, needsOnly, attention]);

  if (loading && rows.length === 0) return <LoadingBlock label="Loading program impact" />;
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p>{error}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={load}>Retry</Button>
      </div>
    );
  }

  const toolbar = <>
    <input aria-label="Search program impact" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search program or barangay" className={filterInputClass} />
    <select aria-label="Filter barangay" value={barangay} onChange={(event) => setBarangay(event.target.value)} className={filterSelectClass}>
      <option value="">All barangays</option>
      {barangays.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
    <select aria-label="Filter program status" value={status} onChange={(event) => setStatus(event.target.value)} className={filterSelectClass}>
      <option value="">All statuses</option>
      {STATUSES.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
    </select>
    <button type="button" aria-pressed={needsOnly} onClick={() => setNeedsOnly((value) => !value)}
      className={`h-9 rounded-lg border px-3 text-sm transition-colors ${needsOnly ? "border-warning/40 bg-warning/10 text-warning" : "border-border text-foreground hover:bg-surface-alt/60"}`}>
      Needs attention only
    </button>
    {attention && (
      <button type="button" onClick={() => setAttention("")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 text-sm text-primary">
        Showing: {attention === "any" ? "Needs attention" : IMPACT_FLAG_LABEL[attention]}<X className="h-3.5 w-3.5" aria-label="Clear" />
      </button>
    )}
  </>;

  return (
    <TableCard toolbar={toolbar}>
      {filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">No programs match these filters.</p>
      ) : (
        <PaginatedTable rows={filtered} label="Program impact" resetKey={JSON.stringify([search, barangay, status, needsOnly, attention])} loading={loading}>
          {(pageRows) => (
            <table aria-label="Program impact" className="w-full text-sm">
              <thead>
                <tr className={tableHeadClass}>
                  <th className={thClass}>Program</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>People reached</th>
                  <th className={`${thClass} text-right`}>Results</th>
                  <th className={`${thClass} text-right`}>Stories</th>
                  <th className={thClass}>Follow-ups</th>
                  <th className={`${thClass} hidden xl:table-cell`}>Last recorded</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.programId} className="border-b border-border/60 last:border-0 hover:bg-surface-alt/30">
                    <td className="px-4 py-3">
                      <Link href={`/officer/impact/programs/${row.programId}`} prefetch={false} className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">{row.title}</Link>
                      <p className="text-xs text-muted-foreground">{row.barangayName ?? "Barangay not assigned"}</p>
                      {row.flags.length > 0 && <div className="mt-1.5"><FlagBadges flags={row.flags} /></div>}
                    </td>
                    <td className="px-4 py-3"><ProgramStatusBadge status={row.status} /></td>
                    <td className="px-4 py-3"><ReachBar reached={row.reached} planned={row.planned} percent={row.reachPercent} status={row.status} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.indicatorCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.stories}</td>
                    <td className="px-4 py-3"><FollowUpCount {...row.followUps} /></td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground xl:table-cell">{formatImpactDate(row.lastRecorded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      )}
    </TableCard>
  );
}
