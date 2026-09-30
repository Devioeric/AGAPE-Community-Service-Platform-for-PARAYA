"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Eye, Home, MapPin, Pencil, Plus, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { hasCapability } from "@/lib/auth/capabilities";
import type { KeyFigure } from "@/lib/community-profile/server";
import { ProfileLoading, ProfileStatCard, formatProfileDate } from "./ProfileUi";

export type ProfileListRow = {
  barangay: { id: string; name: string };
  profile: null | {
    id: string; coverage: string | null; source_title: string; collected_on: string | null;
    respondent_households: number | null; individuals: number | null; updated_at: string; key_figures: KeyFigure[];
  };
};

const sum = (rows: ProfileListRow[], key: "respondent_households" | "individuals") =>
  rows.reduce((total, row) => total + (row.profile?.[key] ?? 0), 0);

/** Officer overview: every barangay, whether it has a profile, and the way to view, add, or edit it. */
export function CommunityProfileList() {
  const actor = useDashboardActor();
  const canEdit = hasCapability(actor.role, actor.permissions, "profiling.cycle.manage");
  const [rows, setRows] = useState<ProfileListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/community-profiles", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Community profiles are temporarily unavailable");
      setRows(payload.data ?? []);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Community profiles are temporarily unavailable");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <ProfileLoading label="Loading barangay profiles" />;
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p>{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }

  const recorded = rows.filter((row) => row.profile).length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ProfileStatCard icon={MapPin} label="Partner barangays" value={rows.length} sub="Active barangays" accent="border-l-primary" />
        <ProfileStatCard icon={ClipboardCheck} label="Profiles recorded" value={`${recorded} of ${rows.length}`} sub={rows.length - recorded === 0 ? "Every barangay has one" : `${rows.length - recorded} still without a profile`} accent="border-l-success" />
        <ProfileStatCard icon={Home} label="Households surveyed" value={sum(rows, "respondent_households")} sub="Across recorded profiles" accent="border-l-info" />
        <ProfileStatCard icon={Users} label="Individuals" value={sum(rows, "individuals")} sub="Across recorded profiles" accent="border-l-warning" />
      </div>

      <Card className="border-border shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <PaginatedTable rows={rows} label="Barangay profiles">
              {(pageRows) => (
                <table aria-label="Barangay profiles" className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Barangay</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Households</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Individuals</th>
                      <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground md:table-cell">Last updated</th>
                      <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(({ barangay, profile }) => {
                      const href = `/officer/profiling/${barangay.id}`;
                      return (
                        <tr key={barangay.id} className="border-b border-border/60 last:border-0 hover:bg-surface-alt/30">
                          <td className="px-4 py-3">
                            <Link href={href} prefetch={false} className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">{barangay.name}</Link>
                            <p className="text-xs text-muted-foreground">{profile?.coverage ?? (profile ? "Coverage not stated" : "No report on file")}</p>
                          </td>
                          <td className="px-4 py-3">
                            {profile
                              ? <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />Recorded</span>
                              : <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />No profile yet</span>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{profile?.respondent_households ?? "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{profile?.individuals ?? "—"}</td>
                          <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{formatProfileDate(profile?.updated_at) ?? "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              {profile && (
                                <Link href={href} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
                                  <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" />View
                                </Link>
                              )}
                              {canEdit && (
                                <Link href={`${href}?edit=1`} prefetch={false} className={buttonVariants({ variant: profile ? "ghost" : "default", size: "sm" })}>
                                  {profile ? <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                                  {profile ? "Edit" : "Add profile"}
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </PaginatedTable>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
