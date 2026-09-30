"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BarChart3, CalendarCheck, ChevronDown, ClipboardList, Plus, Quote, Target, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import { LoadingBlock, RecordHeader, StatCard } from "@/components/shared/RecordUi";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import {
  FlagBadges, FollowUpStateBadge, ProgramStatusBadge, ReachBar,
  followUpTypeLabel, formatDateRange, formatImpactDate, indicatorLabel, storyTypeLabel, tableHeadClass,
} from "@/components/impact/ImpactUi";
import { FollowUpDialog, IndicatorDialog, SdgOutcomeDialog, StoryDialog, VoidRecordDialog, completeFollowUp, type VoidTarget } from "@/components/impact/ImpactRecordDialogs";
import { ImpactChain } from "@/components/impact/ImpactChain";
import { ProgramNeedsSection } from "@/components/impact/ProgramNeedsSection";
import { ProgramSdgSection, ProgramTargetSection, type SdgOutcome } from "@/components/impact/ProgramOutcomeSections";
import { hasCapability } from "@/lib/auth/capabilities";
import type { TargetFigure } from "@/lib/impact/outcome-load";
import type { ProgramNeed } from "@/lib/impact/outcomes";
import type { ProgramImpactSummary } from "@/lib/impact/summary";

type Metric = { id: string; indicator_type: string; value: number; unit: string; recorded_date: string; notes: string | null };
type Story = { id: string; type: string; content: string; recorded_date: string };
type FollowUp = { id: string; followup_type: string; scheduled_date: string; status: string; state: string; completed_date: string | null; notes: string | null };
type Detail = {
  summary: ProgramImpactSummary;
  indicators: Metric[];
  stories: Story[];
  followUps: FollowUp[];
  chain: { needs: ProgramNeed[]; plannedSdgs: number[]; sdgOutcomes: SdgOutcome[]; target: TargetFigure | null; profileAccess: boolean };
};

/** A step label above each part of the report, so the page reads in the same order as the chain. */
function StepLabel({ number, title }: { number: number; title: string }) {
  return (
    <p className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-white">{number}</span>{title}
    </p>
  );
}

function CardSection({ id, children }: { id?: string; children: ReactNode }) {
  return <Card id={id} className="min-w-0 scroll-mt-24 gap-0 border-border py-0 shadow-card">{children}</Card>;
}

/**
 * One program's impact, told as a chain: the need it answers, what it did,
 * its SDG contribution, and the community figure it aims to lower.
 */
export default function ProgramImpactReport() {
  const { id } = useParams<{ id: string }>();
  const actor = useDashboardActor();
  const canManage = hasCapability(actor.role, actor.permissions, "impact.manage");
  const canOpenAnalytics = hasCapability(actor.role, actor.permissions, "program.read");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"metric" | "story" | "followup" | "sdg" | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/impact/programs/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "Program not found." : response.status === 403 ? "You do not have access to program impact." : "Program impact is temporarily unavailable.");
      const payload = await response.json();
      if (!payload.data?.summary) throw new Error("Program impact is temporarily unavailable.");
      setDetail(payload.data);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Program impact is temporarily unavailable."); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const markDone = async (row: FollowUp) => {
    if (!canManage || updating) return;
    setUpdating(row.id);
    try { await completeFollowUp(row); toast.success("Follow-up marked done."); }
    catch (failure) { toast.error(failure instanceof Error ? failure.message : "The follow-up could not be updated."); }
    finally { setUpdating(null); await load(); }
  };

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p>{error}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  if (!detail) return <LoadingBlock label="Loading program impact report" />;

  const { summary, chain } = detail;
  const programs = [{ id: summary.programId, title: summary.title }];
  const started = summary.status === "active" || summary.status === "completed";
  const overdue = detail.followUps.find((row) => row.state === "overdue");
  const afterSave = () => { setDialog(null); void load(); };
  const recordButton = (kind: "metric" | "story" | "followup", label: string) => canManage && (
    <Button size="sm" variant="outline" onClick={() => setDialog(kind)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />{label}</Button>
  );
  const sectionHeader = (title: string, action?: ReactNode) => (
    <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
      <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
      {action}
    </div>
  );

  return (
    <div className="min-w-0 space-y-4">
      <RecordHeader
        icon={Target}
        name={summary.title}
        detail={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {summary.barangayId
              ? <Link href={`/officer/impact/barangays/${summary.barangayId}`} prefetch={false} className="font-medium text-primary underline-offset-4 hover:underline">{summary.barangayName ?? "Barangay"}</Link>
              : <span>Barangay not assigned</span>}
            <span aria-hidden="true">·</span>
            <span>{formatDateRange(summary.startDate, summary.endDate)}</span>
            <ProgramStatusBadge status={summary.status} />
          </span>
        }
        actions={<>
          {canOpenAnalytics && (
            <Link href={`/officer/programs/${summary.programId}/analytics`} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <BarChart3 className="mr-1.5 h-4 w-4" aria-hidden="true" />Program analytics
            </Link>
          )}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ size: "sm" })}>
                Record impact<ChevronDown className="ml-1.5 h-4 w-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {summary.barangayId && <DropdownMenuItem onClick={() => setLinkOpen(true)}>A community need it answers</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => setDialog("metric")}>A result (metric)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDialog("story")}>A story</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDialog("followup")}>A follow-up visit</DropdownMenuItem>
                {started && <DropdownMenuItem onClick={() => setDialog("sdg")}>An SDG contribution</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>}
      >
        {summary.flags.length > 0 && (
          <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <FlagBadges flags={summary.flags} />
            <ul className="space-y-0.5 text-sm text-foreground/80">
              {summary.flags.includes("no_results") && <li>This program is completed, but no results have been recorded.</li>}
              {summary.flags.includes("below_target") && <li>It reached less than half of its target.</li>}
              {summary.flags.includes("overdue_follow_up") && <li>{overdue ? `Its ${followUpTypeLabel(overdue.followup_type).toLowerCase()} was due on ${formatImpactDate(overdue.scheduled_date)}.` : "A follow-up is overdue."}</li>}
            </ul>
          </div>
        )}
      </RecordHeader>

      <ImpactChain
        summary={summary}
        needs={chain.needs}
        plannedSdgs={chain.plannedSdgs}
        recordedCount={chain.sdgOutcomes.length}
        target={chain.target}
        canManage={canManage && Boolean(summary.barangayId)}
        onLinkNeed={() => setLinkOpen(true)}
      />

      <StepLabel number={1} title="Need it answers" />
      <CardSection id="impact-needs">
        <ProgramNeedsSection
          programId={summary.programId}
          barangayId={summary.barangayId}
          barangayName={summary.barangayName}
          needs={chain.needs}
          canManage={canManage}
          linkOpen={linkOpen}
          onLinkOpenChange={setLinkOpen}
          onChanged={() => void load()}
        />
      </CardSection>

      <StepLabel number={2} title="What it did" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="People reached" value={summary.reached.toLocaleString()} sub={summary.planned ? `of ${summary.planned.toLocaleString()} targeted` : "No target in the proposal"} accent="border-l-primary" />
        <StatCard icon={ClipboardList} label="Results recorded" value={summary.indicatorCount} sub={summary.lastRecorded ? `Last on ${formatImpactDate(summary.lastRecorded)}` : "None yet"} accent="border-l-accent" />
        <StatCard icon={Quote} label="Stories" value={summary.stories} sub="Testimonials, case studies, observations" accent="border-l-success" />
        <StatCard icon={CalendarCheck} label="Follow-ups done" value={`${summary.followUps.completed} of ${summary.followUps.total}`} sub={`${summary.followUps.overdue} overdue · ${summary.followUps.upcoming} upcoming`} accent="border-l-info" />
      </div>
      <CardSection>
        <div className="space-y-2 px-5 py-4">
          <p className="text-sm font-medium text-foreground">Reach against target</p>
          <ReachBar reached={summary.reached} planned={summary.planned} percent={summary.reachPercent} status={summary.status} size="lg" />
          <p className="text-xs text-muted-foreground">
            {summary.planned
              ? "The target is the number of beneficiaries the program's approved proposal expected to reach."
              : "This program has no target because it did not come from an approved proposal with expected beneficiaries."}
          </p>
        </div>
      </CardSection>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <CardSection id="impact-results">
          {sectionHeader("Results", recordButton("metric", "Result"))}
          {summary.outputs.length > 0 && (
            <ul className="divide-y divide-border/60 border-b border-border px-5 py-1">
              {summary.outputs.map((output) => (
                <li key={`${output.type}-${output.unit}`} className="flex justify-between gap-2 py-2 text-sm">
                  <span className="text-muted-foreground">{indicatorLabel(output.type)}</span>
                  <span className="font-medium tabular-nums">{output.total.toLocaleString()} {output.unit}</span>
                </li>
              ))}
            </ul>
          )}
          {detail.indicators.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No results recorded yet. Record how many people the program reached after each activity.</p>
          ) : (
            <PaginatedTable rows={detail.indicators} label="Program results">
              {(pageRows) => (
                <table aria-label="Program results" className="w-full text-sm">
                  <thead>
                    <tr className={tableHeadClass}>
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Result</th>
                      <th className="px-4 py-2.5 text-right font-medium">Value</th>
                      {canManage && <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/60 align-top last:border-0">
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatImpactDate(row.recorded_date)}</td>
                        <td className="px-4 py-2.5">
                          {indicatorLabel(row.indicator_type)}
                          {row.notes && <p className="line-clamp-2 text-xs text-muted-foreground">{row.notes}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{Number(row.value).toLocaleString()} {row.unit}</td>
                        {canManage && (
                          <td className="px-4 py-2.5 text-right">
                            <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => setVoidTarget({ kind: "indicator", id: row.id, label: "result" })}>Void</Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PaginatedTable>
          )}
        </CardSection>

        <CardSection>
          {sectionHeader("Follow-ups", recordButton("followup", "Follow-up"))}
          {detail.followUps.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No follow-ups scheduled. Schedule a 6-month visit to see whether the change lasted.</p>
          ) : (
            <ol className="space-y-4 px-5 py-4">
              {detail.followUps.map((row) => (
                <li key={row.id} className="relative border-l-2 border-border pl-4">
                  <span aria-hidden="true" className={`absolute -left-[5px] top-1.5 h-2 w-2 rounded-full ${row.state === "completed" ? "bg-success" : row.state === "overdue" ? "bg-danger" : "bg-info"}`} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{followUpTypeLabel(row.followup_type)}</p>
                    <FollowUpStateBadge state={row.state} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.state === "completed" && row.completed_date ? `Done ${formatImpactDate(row.completed_date)}` : `Due ${formatImpactDate(row.scheduled_date)}`}
                  </p>
                  {row.notes && <p className="mt-1 line-clamp-2 break-words text-sm text-foreground/80">{row.notes}</p>}
                  {canManage && (
                    <div className="mt-2 flex gap-2">
                      {row.state !== "completed" && row.state !== "cancelled" && (
                        <Button size="sm" variant="outline" className="h-7" disabled={updating !== null} onClick={() => void markDone(row)}>{updating === row.id ? "Saving…" : "Mark done"}</Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" disabled={updating !== null} onClick={() => setVoidTarget({ kind: "followup", id: row.id, label: "follow-up" })}>Void</Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardSection>
      </div>

      <CardSection>
        {sectionHeader("Stories", recordButton("story", "Story"))}
        {detail.stories.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No stories yet. Add a testimonial or observation from the community.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {detail.stories.map((story) => {
              const open = expanded.includes(story.id);
              return (
                <li key={story.id} className="px-5 py-4">
                  <p className="text-xs font-medium text-muted-foreground">{storyTypeLabel(story.type)} · {formatImpactDate(story.recorded_date)}</p>
                  <p className={`mt-1 whitespace-pre-wrap break-words text-sm text-foreground ${open ? "" : "line-clamp-3"}`}>{story.content}</p>
                  <div className="mt-1 flex gap-3">
                    {story.content.length > 240 && (
                      <button type="button" aria-expanded={open} onClick={() => setExpanded((old) => (open ? old.filter((item) => item !== story.id) : old.concat(story.id)))} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                        {open ? "Show less" : "Show more"}
                      </button>
                    )}
                    {canManage && <button type="button" onClick={() => setVoidTarget({ kind: "qualitative", id: story.id, label: "story" })} className="text-xs text-muted-foreground underline-offset-4 hover:underline">Void</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardSection>

      <StepLabel number={3} title="SDG contribution" />
      <CardSection id="impact-sdgs">
        <ProgramSdgSection
          plannedSdgs={chain.plannedSdgs}
          outcomes={chain.sdgOutcomes}
          canRecord={canManage}
          started={started}
          onRecord={() => setDialog("sdg")}
          onVoid={(outcome) => setVoidTarget({ kind: "sdg_outcome", id: outcome.id, label: "SDG contribution" })}
        />
      </CardSection>

      {/* Step 4 names the figure the program aims to lower; a change needs a newer community profile. */}
      <StepLabel number={4} title="Community figure" />
      <CardSection id="impact-target">
        <ProgramTargetSection target={chain.target} barangayId={summary.barangayId} barangayName={summary.barangayName} profileAccess={chain.profileAccess} />
      </CardSection>

      {canManage && <>
        <IndicatorDialog open={dialog === "metric"} onOpenChange={(open) => { if (!open) setDialog(null); }} programs={programs} defaultProgramId={summary.programId} lockProgram onSaved={afterSave} />
        <StoryDialog open={dialog === "story"} onOpenChange={(open) => { if (!open) setDialog(null); }} programs={programs} defaultProgramId={summary.programId} lockProgram onSaved={afterSave} />
        <FollowUpDialog open={dialog === "followup"} onOpenChange={(open) => { if (!open) setDialog(null); }} programs={programs} defaultProgramId={summary.programId} lockProgram onSaved={afterSave} />
        <SdgOutcomeDialog open={dialog === "sdg"} onOpenChange={(open) => { if (!open) setDialog(null); }} programId={summary.programId} plannedSdgs={chain.plannedSdgs} onSaved={afterSave} />
        <VoidRecordDialog target={voidTarget} onClose={() => setVoidTarget(null)} onVoided={() => void load()} />
      </>}
    </div>
  );
}
