"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ProgramImpactSummary } from "@/lib/impact/summary";
import { FlagBadges, type ImpactFlag } from "./ImpactUi";

const TILES: ReadonlyArray<{ flag: ImpactFlag; label: string; tone: string }> = [
  { flag: "no_results", label: "Completed without results", tone: "border-warning/30 bg-warning/5 text-warning" },
  { flag: "overdue_follow_up", label: "Overdue follow-ups", tone: "border-danger/30 bg-danger/5 text-danger" },
  { flag: "below_target", label: "Under half of target", tone: "border-warning/30 bg-warning/5 text-warning" },
];

/** Overview panel: counts per flag and the first flagged programs, each linking to its report. */
export function NeedsAttention() {
  const [rows, setRows] = useState<ProgramImpactSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/impact/programs", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((payload) => setRows(((payload.data ?? []) as ProgramImpactSummary[]).filter((row) => row.flags.length > 0)))
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);

  if (error) {
    return <Card className="border-border shadow-card"><CardContent className="p-4 text-sm text-muted-foreground">Needs-attention data is temporarily unavailable.</CardContent></Card>;
  }
  if (!rows) return <Card className="border-border shadow-card"><CardContent role="status" className="p-4 text-sm text-muted-foreground">Checking programs…</CardContent></Card>;

  const count = (flag: ImpactFlag) => rows.filter((row) => row.flags.includes(flag)).length;
  return (
    <Card className="border-border shadow-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
            {rows.length ? <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />}
            Needs attention
          </h2>
          {rows.length > 0 && (
            <Link href="/officer/impact/programs?attention=any" prefetch={false} className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
              See all {rows.length} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {TILES.map(({ flag, label, tone }) => {
            const value = count(flag);
            const body = <><span className="block font-heading text-2xl font-bold tabular-nums">{value}</span><span className="text-xs">{label}</span></>;
            return value > 0
              ? <Link key={flag} href={`/officer/impact/programs?attention=${flag}`} prefetch={false} className={`rounded-lg border p-3 transition-colors hover:bg-card ${tone}`}>{body}</Link>
              : <div key={flag} className="rounded-lg border border-border bg-surface-alt/30 p-3 text-muted-foreground">{body}</div>;
          })}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs attention: every completed program has results and no follow-up is overdue.</p>
        ) : (
          <ul className="divide-y divide-border/70 rounded-lg border border-border">
            {rows.slice(0, 5).map((row) => (
              <li key={row.programId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/officer/impact/programs/${row.programId}`} prefetch={false} className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">{row.title}</Link>
                  <p className="text-xs text-muted-foreground">{row.barangayName ?? "Barangay not assigned"}</p>
                </div>
                <FlagBadges flags={row.flags} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
