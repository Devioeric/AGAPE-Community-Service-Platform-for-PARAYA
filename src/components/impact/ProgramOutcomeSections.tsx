"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SdgBadge, formatImpactDate } from "@/components/impact/ImpactUi";
import { SDG_COLORS } from "@/lib/constants";
import { formatPercent } from "@/lib/community-profile/stats";
import type { TargetFigure } from "@/lib/impact/outcome-load";

export type SdgOutcome = { id: string; program_id: string; sdg_goal: number; actual_indicator: string; actual_contribution: string; created_at: string };

function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
      <div>
        <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Step 3: SDGs planned in the proposal, and contributions recorded once the program started. */
export function ProgramSdgSection({ plannedSdgs, outcomes, canRecord, started, onRecord, onVoid }: {
  plannedSdgs: number[];
  outcomes: SdgOutcome[];
  canRecord: boolean;
  started: boolean;
  onRecord: () => void;
  onVoid: (outcome: SdgOutcome) => void;
}) {
  return (
    <>
      <SectionHeader
        title="SDG contribution"
        description="Planned in the proposal, and what the program contributed once it started."
        action={canRecord && started ? <Button size="sm" variant="outline" onClick={onRecord}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Record a contribution</Button> : undefined}
      />
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned</h4>
          {plannedSdgs.length > 0
            ? <ul className="space-y-1.5">{plannedSdgs.map((sdg) => <li key={sdg}><SdgBadge goal={sdg} /></li>)}</ul>
            : <p className="text-sm text-muted-foreground">No SDGs were planned for this program.</p>}
        </section>
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recorded</h4>
          {outcomes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {started ? "No contribution recorded yet. Record what the program achieved toward its SDGs." : "Contributions can be recorded once the program starts."}
            </p>
          ) : (
            <ul className="space-y-2">
              {outcomes.map((outcome) => (
                <li key={outcome.id} className="rounded-lg border border-border border-l-4 bg-background p-3" style={{ borderLeftColor: SDG_COLORS[outcome.sdg_goal] }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SdgBadge goal={outcome.sdg_goal} />
                    <span className="text-xs text-muted-foreground">{formatImpactDate(outcome.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{outcome.actual_indicator}</p>
                  <p className="text-sm text-foreground/80">{outcome.actual_contribution}</p>
                  {canRecord && <button type="button" onClick={() => onVoid(outcome)} className="mt-1 text-xs text-muted-foreground underline-offset-4 hover:underline">Void</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/** Step 4: the community profile figure the program aims to lower, with its current value. */
export function ProgramTargetSection({ target, barangayId, barangayName, profileAccess }: {
  target: TargetFigure | null;
  barangayId: string | null;
  barangayName: string | null;
  profileAccess: boolean;
}) {
  const current = target?.current ?? null;
  const place = barangayName ?? "the barangay";
  return (
    <>
      <SectionHeader title="Community figure it aims to lower" description="Optional. Set when the program was planned from the barangay's community profile." />
      <div className="px-5 py-4">
        {!target ? (
          <p className="text-sm text-muted-foreground">This program has no target figure. Set one in Program Tracking if it was planned from the community profile.</p>
        ) : current && current.percent !== null ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center">
            <div>
              <p className="text-sm font-medium text-foreground">{target.label}</p>
              <p className="font-heading text-4xl font-bold text-foreground tabular-nums">{formatPercent(current.percent)}</p>
              <p className="text-xs text-muted-foreground">{current.count} of {current.total} {current.base} in {place} · as of {formatImpactDate(current.asOf)}</p>
            </div>
            <div className="space-y-2">
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-warning/70" style={{ width: `${Math.min(100, current.percent)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">Change is measured once PARAYA records a newer community profile for {place}. Until then this is the current value, not a result of the program.</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aims to lower <span className="font-medium text-foreground">{target.label}</span>, but {place} has no community profile yet, so the current value is unknown.{" "}
            {profileAccess && barangayId && <Link href={`/officer/profiling/${barangayId}`} prefetch={false} className="font-medium text-primary underline-offset-4 hover:underline">Open Community Profile</Link>}
          </p>
        )}
      </div>
    </>
  );
}
