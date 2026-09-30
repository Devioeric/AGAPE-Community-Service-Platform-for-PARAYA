"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SdgBadge, TableCard, sentenceCase, tableHeadClass, thClass } from "@/components/impact/ImpactUi";
import { SDG_COLORS } from "@/lib/constants";
import type { NeedCategoryContribution, SdgContribution } from "@/lib/impact/outcomes";

/** Overview roll-ups: what programs contributed per focus SDG, and how far each need category has been answered. */
export function ImpactContribution() {
  const [data, setData] = useState<{ sdgs: SdgContribution[]; categories: NeedCategoryContribution[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/impact/contribution", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((payload) => { if (!cancelled) setData(payload.data ?? null); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <Card className="border-border shadow-card"><CardContent className="p-4 text-sm text-muted-foreground">Contribution roll-ups are temporarily unavailable.</CardContent></Card>;
  if (!data) return <Card className="border-border shadow-card"><CardContent role="status" className="p-4 text-sm text-muted-foreground">Loading contribution roll-ups…</CardContent></Card>;

  const categories = data.categories.filter((category) => category.approvedNeeds > 0);
  return (
    <div className="space-y-5">
      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base">Contribution by SDG</CardTitle>
          <p className="text-sm text-muted-foreground">People reached by programs aligned with each focus SDG, and the latest contribution recorded.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.sdgs.map((row) => {
            const latest = row.latestOutcomes[0];
            return (
              <div key={row.sdg} className="flex flex-col rounded-lg border border-border border-t-4 bg-background p-4" style={{ borderTopColor: SDG_COLORS[row.sdg] }}>
                {/* Fixed height keeps the numbers aligned when a goal name wraps. */}
                <div className="min-h-10"><SdgBadge goal={row.sdg} /></div>
                <p className="mt-2 font-heading text-3xl font-bold text-foreground tabular-nums">{row.peopleReached.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">people reached · {row.programs} program{row.programs === 1 ? "" : "s"}, {row.programsWithOutcome} with a recorded contribution</p>
                {latest ? (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <p className="line-clamp-2 text-sm text-foreground">“{latest.contribution}”</p>
                    <Link href={`/officer/impact/programs/${latest.programId}`} prefetch={false} className="mt-1 block truncate text-xs font-medium text-primary underline-offset-4 hover:underline">{latest.programTitle}</Link>
                  </div>
                ) : <p className="mt-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">No contribution recorded yet.</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <TableCard>
        <div className="border-b border-border px-5 py-3">
          <h3 className="font-heading text-base font-semibold text-foreground">Needs answered, by category</h3>
          <p className="text-xs text-muted-foreground">Approved community needs, how many a program has taken on, and how far they have been met.</p>
        </div>
        {categories.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">No approved community needs yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={tableHeadClass}>
                  <th className={thClass}>Category</th>
                  <th className={`${thClass} text-right`}>Approved needs</th>
                  <th className={thClass}>Answered by a program</th>
                  <th className={`${thClass} text-right`}>In progress</th>
                  <th className={`${thClass} text-right`}>Addressed</th>
                  <th className={`${thClass} text-right`}>People reached</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((row) => (
                  <tr key={row.category} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{sentenceCase(row.category)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.approvedNeeds}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="w-14 whitespace-nowrap tabular-nums">{row.answered} of {row.approvedNeeds}</span>
                        <span className="block h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (row.answered / row.approvedNeeds) * 100)}%` }} />
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.inProgress}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.addressed}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.peopleReached.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">People reached counts the programs linked to these needs; each program counts once per category. A need is answered once a program is linked to it on its impact report.</p>
      </TableCard>
    </div>
  );
}
