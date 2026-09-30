"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import { PROFILE_KEY_FIGURES } from "@/lib/community-profile/catalog";
import { formatPercent } from "@/lib/community-profile/stats";
import type { ProfileListRow } from "./CommunityProfileList";

/** Analytics → Community needs: key figures of every recorded profile, side by side. */
export function CommunityProfileComparison() {
  const [rows, setRows] = useState<ProfileListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/community-profiles", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.data)) throw new Error("Community profiles are temporarily unavailable.");
      setRows(payload.data.filter((row: ProfileListRow) => row.profile));
    } catch { setError("Community profiles are temporarily unavailable."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <Card className="border-border shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-heading text-base">
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Community profiles
        </CardTitle>
        <p className="text-sm text-muted-foreground">Key figures from each barangay&apos;s profiling report. Shares are of surveyed households.</p>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <p role="status" className="px-6 pb-6 text-sm text-muted-foreground">Loading community profiles…</p>
          : error ? (
            <div role="alert" className="px-6 pb-6 text-sm">
              <p>{error}</p>
              <Button onClick={() => void load()} variant="outline" size="sm" className="mt-2">Retry</Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No community profiles recorded yet. Add one from Community Needs Assessment → Community Profile.</p>
          ) : (
            <div className="overflow-x-auto">
              <PaginatedTable rows={rows} label="Community profiles">
                {(pageRows) => (
                  <table aria-label="Community profiles" className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-border bg-surface-alt/50">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Barangay</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Households</th>
                        {PROFILE_KEY_FIGURES.map((figure) => <th key={figure.key} className="px-4 py-3 text-right font-medium text-muted-foreground">{figure.label}</th>)}
                        <th className="px-4 py-3"><span className="sr-only">Profile</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => (
                        <tr key={row.barangay.id} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{row.barangay.name}</p>
                            <p className="text-xs text-muted-foreground">{row.profile?.coverage ?? "Coverage not stated"}</p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.profile?.respondent_households ?? "—"}</td>
                          {PROFILE_KEY_FIGURES.map((figure) => {
                            const value = row.profile?.key_figures.find((item) => item.key === figure.key);
                            return <td key={figure.key} className="px-4 py-3 text-right tabular-nums">{formatPercent(value?.percent ?? null)}</td>;
                          })}
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={`/officer/profiling/${row.barangay.id}`} prefetch={false}>View profile</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </PaginatedTable>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
