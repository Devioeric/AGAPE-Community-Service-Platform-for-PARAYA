"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarCheck, ClipboardList, Quote, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import { EmptyState, LoadingBlock, RecordHeader, StatCard } from "@/components/shared/RecordUi";
import {
  FlagBadges, FollowUpCount, FollowUpStateBadge, ProgramStatusBadge, ReachBar,
  SdgBadge, formatImpactDate, sentenceCase, storyTypeLabel, tableHeadClass, thClass,
} from "@/components/impact/ImpactUi";
import { SDG_COLORS } from "@/lib/constants";
import { formatPercent } from "@/lib/community-profile/stats";
import type { KeyFigure } from "@/lib/community-profile/server";
import type { BarangayImpactSummary, ProgramImpactSummary } from "@/lib/impact/summary";
import type { NeedCategoryContribution, SdgContribution } from "@/lib/impact/outcomes";
import type { TargetFigure } from "@/lib/impact/outcome-load";

type Detail = {
  summary: BarangayImpactSummary;
  programs: ProgramImpactSummary[];
  stories: Array<{ id: string; program_id: string; program_title: string; type: string; content: string; recorded_date: string }>;
  followUps: Array<{ id: string; program_id: string; program_title: string; followup_type: string; scheduled_date: string; status: string; state: string }>;
  context: {
    profile: { coverage: string | null; respondentHouseholds: number | null; keyFigures: KeyFigure[] } | null;
    profileAccess: boolean;
    needs: { approved: number; addressed: number };
  };
  contribution: { sdgs: SdgContribution[]; categories: NeedCategoryContribution[] };
  targets: Array<TargetFigure & { programs: Array<{ id: string; title: string }> }>;
};

function ShareRow({ label, percent, detail }: { label: string; percent: number | null; detail?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-foreground">{label}</span>
        <span className="font-medium tabular-nums">{formatPercent(percent)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(100, percent ?? 0)}%` }} />
      </div>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

/** One barangay: its situation (community profile, approved needs) next to what its programs achieved. */
export default function BarangayImpactReport() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/impact/barangays/${id}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.status === 404 ? "Barangay not found." : response.status === 403 ? "You do not have access to impact data." : "Barangay impact is temporarily unavailable."))))
      .then((payload) => setDetail(payload.data))
      .catch((failure) => setError(failure instanceof Error ? failure.message : "Barangay impact is temporarily unavailable."));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p>{error}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={load}>Retry</Button>
      </div>
    );
  }
  if (!detail) return <LoadingBlock label="Loading barangay impact report" />;

  const { summary, context } = detail;
  const needCategories = detail.contribution.categories.filter((row) => row.approvedNeeds > 0);
  const sdgRows = detail.contribution.sdgs.filter((row) => row.programs > 0);
  const addressedPercent = context.needs.approved > 0 ? (context.needs.addressed / context.needs.approved) * 100 : null;

  return (
    <div className="space-y-5">
      <RecordHeader
        name={summary.name}
        detail={context.profile?.coverage ?? "Partner barangay"}
        actions={<>
          <Link href="/officer/impact/barangays" prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />All barangays
          </Link>
          {context.profile && <Link href={`/officer/profiling/${id}`} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>Community profile</Link>}
        </>}
      >
        {summary.flaggedPrograms > 0 && (
          <Link href={`/officer/impact/programs?barangay=${id}&attention=any`} prefetch={false}
            className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning underline-offset-4 hover:underline">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {summary.flaggedPrograms} program{summary.flaggedPrograms === 1 ? " needs" : "s need"} attention
          </Link>
        )}
      </RecordHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="People reached" value={summary.reached.toLocaleString()} sub="Across this barangay's programs" accent="border-l-primary" />
        <StatCard icon={ClipboardList} label="Programs measured" value={`${summary.measuredPrograms} of ${summary.programs}`} sub={`${summary.completedPrograms} completed`} accent="border-l-accent" />
        <StatCard icon={Quote} label="Stories" value={summary.stories} sub="Testimonials, case studies, observations" accent="border-l-success" />
        <StatCard icon={CalendarCheck} label="Follow-ups done" value={`${summary.followUps.completed} of ${summary.followUps.total}`} sub={`${summary.followUps.overdue} overdue · ${summary.followUps.upcoming} upcoming`} accent="border-l-info" />
      </div>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-2"><CardTitle className="font-heading text-base">Needs and results</CardTitle></CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">What the community profile shows</h3>
            {context.profile ? <>
              {context.profile.keyFigures.map((figure) => (
                <ShareRow key={figure.key} label={figure.label} percent={figure.percent} detail={figure.count !== null ? `${figure.count} of ${figure.total} households` : undefined} />
              ))}
              {detail.targets.length > 0 && (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Figures its programs aim to lower</p>
                  {detail.targets.map((target) => (
                    <div key={target.key} className="text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-foreground">{target.label}</span>
                        <span className="font-medium tabular-nums">{formatPercent(target.current?.percent ?? null)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Aimed at by{" "}
                        {target.programs.map((program, index) => (
                          <span key={program.id}>
                            {index > 0 && ", "}
                            <Link href={`/officer/impact/programs/${program.id}`} prefetch={false} className="text-primary underline-offset-4 hover:underline">{program.title}</Link>
                          </span>
                        ))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{context.profile.respondentHouseholds ?? "—"} households surveyed</p>
            </> : context.profileAccess ? (
              <p className="text-sm text-muted-foreground">
                No community profile yet. <Link href={`/officer/profiling/${id}?edit=1`} prefetch={false} className="font-medium text-primary underline-offset-4 hover:underline">Add one</Link> to see the barangay&apos;s situation next to its results.
              </p>
            ) : <p className="text-sm text-muted-foreground">The community profile is not available for your role.</p>}
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Community needs</h3>
            {context.needs.approved === 0 ? <p className="text-sm text-muted-foreground">No approved community needs yet.</p> : (
              <ShareRow label={`${context.needs.addressed} of ${context.needs.approved} approved needs addressed`} percent={addressedPercent} />
            )}
            <Link href="/officer/community-needs" prefetch={false} className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">Open Community Needs →</Link>
          </section>
        </CardContent>
      </Card>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base">Contribution</CardTitle>
          <p className="text-sm text-muted-foreground">Which needs its programs answer, and what they contributed toward the SDGs.</p>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Needs by category</h3>
            {needCategories.length === 0 ? <p className="text-sm text-muted-foreground">No approved community needs in {summary.name} yet.</p> : needCategories.map((row) => (
              <div key={row.category}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">{sentenceCase(row.category)}</span>
                  <span className="tabular-nums text-muted-foreground">{row.answered} of {row.approvedNeeds} answered</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (row.answered / row.approvedNeeds) * 100)}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{row.inProgress} in progress · {row.addressed} addressed · {row.peopleReached.toLocaleString()} people reached</p>
              </div>
            ))}
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">SDG contribution</h3>
            {sdgRows.length === 0 ? <p className="text-sm text-muted-foreground">No program in {summary.name} is aligned with an SDG yet.</p> : (
              <ul className="space-y-2">
                {sdgRows.map((row) => (
                  <li key={row.sdg} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border border-l-4 px-3 py-2" style={{ borderLeftColor: SDG_COLORS[row.sdg] }}>
                    <SdgBadge goal={row.sdg} />
                    <span className="text-xs text-muted-foreground tabular-nums">{row.peopleReached.toLocaleString()} reached · {row.programsWithOutcome} of {row.programs} with a contribution</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      </Card>

      {detail.programs.length === 0 ? (
        <EmptyState title={`No programs in ${summary.name} yet`}>Results appear here once programs run in this barangay and their impact is recorded.</EmptyState>
      ) : (
        <Card className="gap-0 border-border py-0 shadow-card">
          <div className="border-b border-border px-5 py-3"><h3 className="font-heading text-base font-semibold text-foreground">Programs</h3></div>
          <PaginatedTable rows={detail.programs} label="Barangay programs">
            {(pageRows) => (
              <table aria-label="Barangay programs" className="w-full text-sm">
                <thead>
                  <tr className={tableHeadClass}>
                    <th className={thClass}>Program</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>People reached</th>
                    <th className={`${thClass} text-right`}>Results</th>
                    <th className={thClass}>Follow-ups</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.programId} className="border-b border-border/60 last:border-0 hover:bg-surface-alt/30">
                      <td className="px-4 py-3">
                        <Link href={`/officer/impact/programs/${row.programId}`} prefetch={false} className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">{row.title}</Link>
                        {row.flags.length > 0 && <div className="mt-1.5"><FlagBadges flags={row.flags} /></div>}
                      </td>
                      <td className="px-4 py-3"><ProgramStatusBadge status={row.status} /></td>
                      <td className="px-4 py-3"><ReachBar reached={row.reached} planned={row.planned} percent={row.reachPercent} status={row.status} /></td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.indicatorCount}</td>
                      <td className="px-4 py-3"><FollowUpCount {...row.followUps} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2"><CardTitle className="font-heading text-base">Recent stories</CardTitle></CardHeader>
          <CardContent>
            {detail.stories.length === 0 ? <p className="text-sm text-muted-foreground">No stories recorded yet.</p> : (
              <ul className="divide-y divide-border/70">
                {detail.stories.map((story) => (
                  <li key={story.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-xs text-muted-foreground">
                      {storyTypeLabel(story.type)} · {formatImpactDate(story.recorded_date)} ·{" "}
                      <Link href={`/officer/impact/programs/${story.program_id}`} prefetch={false} className="font-medium text-primary underline-offset-4 hover:underline">{story.program_title}</Link>
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm text-foreground">{story.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2"><CardTitle className="font-heading text-base">Open follow-ups</CardTitle></CardHeader>
          <CardContent>
            {detail.followUps.length === 0 ? <p className="text-sm text-muted-foreground">No open follow-ups.</p> : (
              <ul className="divide-y divide-border/70">
                {detail.followUps
                  .slice()
                  .sort((a, b) => (a.state === "overdue" ? 0 : 1) - (b.state === "overdue" ? 0 : 1) || a.scheduled_date.localeCompare(b.scheduled_date))
                  .map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <Link href={`/officer/impact/programs/${row.program_id}`} prefetch={false} className="text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">{row.program_title}</Link>
                        <p className="text-xs text-muted-foreground">{formatImpactDate(row.scheduled_date)}</p>
                      </div>
                      <FollowUpStateBadge state={row.state} />
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
