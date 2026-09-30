"use client";

import type { ReactNode } from "react";
import { CheckCircle2, ChevronRight, CircleDashed } from "lucide-react";
import { Card } from "@/components/ui/card";
import { NeedStatusBadge, ReachBar, SdgBadge, sentenceCase } from "@/components/impact/ImpactUi";
import { formatPercent } from "@/lib/community-profile/stats";
import type { TargetFigure } from "@/lib/impact/outcome-load";
import type { ProgramNeed } from "@/lib/impact/outcomes";
import type { ProgramImpactSummary } from "@/lib/impact/summary";

export { SdgBadge } from "@/components/impact/ImpactUi";

type Props = {
  summary: ProgramImpactSummary;
  needs: ProgramNeed[];
  plannedSdgs: number[];
  recordedCount: number;
  target: TargetFigure | null;
  canManage: boolean;
  onLinkNeed: () => void;
};

// Least advanced first, so the chain shows what still needs work.
const NEED_ORDER: Record<string, number> = { identified: 0, in_progress: 1, addressed: 2 };

function Step({ number, title, done, href, action, children }: {
  number: number; title: string; done: boolean; href: string; action?: ReactNode; children: ReactNode;
}) {
  const Icon = done ? CheckCircle2 : CircleDashed;
  return (
    <li className="relative flex min-w-0 flex-col gap-2 px-4 py-4 md:px-5">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 shrink-0 ${done ? "text-success" : "text-muted-foreground/60"}`} aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Step {number}</span>
        <span className="sr-only">{done ? "(recorded)" : "(not recorded yet)"}</span>
      </div>
      <a href={href} className="font-heading text-sm font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline">{title}</a>
      <div className="min-w-0 flex-1 space-y-1.5 text-sm">{children}</div>
      {action}
      {number < 4 && (
        <ChevronRight aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 rounded-full border border-border bg-card p-1 text-muted-foreground md:block" />
      )}
    </li>
  );
}

/** The program's impact story in four steps: the need, what it did, SDG contribution, and the community figure it aims to lower. */
export function ImpactChain({ summary, needs, plannedSdgs, recordedCount, target, canManage, onLinkNeed }: Props) {
  const sortedNeeds = needs.slice().sort((a, b) => (NEED_ORDER[a.status] ?? 0) - (NEED_ORDER[b.status] ?? 0));
  const firstNeed = sortedNeeds[0];
  const current = target?.current ?? null;
  const muted = "text-muted-foreground";
  return (
    <Card aria-label="Program impact chain" className="gap-0 border-border py-0 shadow-card">
      <ol className="grid divide-y divide-border md:grid-cols-4 md:divide-x md:divide-y-0">
        <Step number={1} title="Need it answers" done={needs.length > 0} href="#impact-needs"
          action={needs.length === 0 && canManage ? <button type="button" onClick={onLinkNeed} className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline">Link a need</button> : undefined}>
          {firstNeed ? <>
            <p className="line-clamp-2 font-medium text-foreground">{firstNeed.title}</p>
            <p className={`text-xs ${muted}`}>{sentenceCase(firstNeed.category)}{needs.length > 1 ? ` · +${needs.length - 1} more` : ""}</p>
            <NeedStatusBadge status={firstNeed.status} />
          </> : <p className={muted}>No community need linked yet.</p>}
        </Step>

        <Step number={2} title="What it did" done={summary.indicatorCount > 0} href="#impact-results">
          <ReachBar reached={summary.reached} planned={summary.planned} percent={summary.reachPercent} status={summary.status} />
          <p className={`text-xs ${muted}`}>{summary.indicatorCount} result{summary.indicatorCount === 1 ? "" : "s"} · {summary.stories} stor{summary.stories === 1 ? "y" : "ies"}</p>
        </Step>

        <Step number={3} title="SDG contribution" done={recordedCount > 0} href="#impact-sdgs">
          {plannedSdgs.length > 0
            ? <div className="flex flex-wrap gap-1.5">{plannedSdgs.map((sdg) => <SdgBadge key={sdg} goal={sdg} compact={plannedSdgs.length > 2} />)}</div>
            : <p className={muted}>No SDGs planned.</p>}
          <p className={`text-xs ${muted}`}>{recordedCount ? `${recordedCount} contribution${recordedCount === 1 ? "" : "s"} recorded` : "No contribution recorded yet"}</p>
        </Step>

        <Step number={4} title="Community figure" done={Boolean(current && current.percent !== null)} href="#impact-target">
          {target ? <>
            <p className="font-medium text-foreground">{target.label}</p>
            <p className={`text-xs ${muted}`}>{current && current.percent !== null ? `${formatPercent(current.percent)} now` : "No profile value yet"}</p>
          </> : <p className={muted}>No target figure. Optional.</p>}
        </Step>
      </ol>
    </Card>
  );
}
