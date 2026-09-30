"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { isBeneficiaryIndicator, titleCase } from "@/lib/analytics/insights";
import { SDG_COLORS, SDG_LABELS } from "@/lib/constants";
import { IMPACT_FLAG_LABEL, type ImpactFlag } from "@/lib/impact/summary";

export type { ImpactFlag } from "@/lib/impact/summary";

// Shared labels and presentation for Impact Measurement.

export const INDICATOR_TYPES = [
  { value: "beneficiaries_reached", label: "Beneficiaries reached", unit: "persons" },
  { value: "families_served", label: "Families served", unit: "families" },
  { value: "trainings_conducted", label: "Trainings conducted", unit: "sessions" },
  { value: "materials_distributed", label: "Materials distributed", unit: "pcs" },
  { value: "volunteer_hours", label: "Volunteer hours", unit: "hours" },
  { value: "custom", label: "Other / custom", unit: "" },
] as const;

export function indicatorLabel(type: string | null | undefined) {
  if (isBeneficiaryIndicator(type)) return "Beneficiaries reached";
  return INDICATOR_TYPES.find((item) => item.value === type)?.label ?? titleCase(type ?? "custom");
}

const STORY_TYPE_LABEL: Record<string, string> = {
  testimonial: "Testimonial", case_study: "Case study", pre_post_narrative: "Before-and-after narrative", observation: "Observation",
};
export const storyTypeLabel = (type: string) => STORY_TYPE_LABEL[type] ?? titleCase(type);

const FOLLOW_UP_TYPE_LABEL: Record<string, string> = {
  immediate: "Immediate follow-up (within 1 week)", "6_month": "6-month follow-up", "12_month": "12-month follow-up",
};
export const followUpTypeLabel = (type: string) => FOLLOW_UP_TYPE_LABEL[type] ?? titleCase(type);

/** Date-only values are Philippine calendar dates; timestamps are shown in Manila time. */
export function formatImpactDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(date);
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Dates not set";
  if (start && end) return `${formatImpactDate(start)} – ${formatImpactDate(end)}`;
  return start ? `From ${formatImpactDate(start)}` : `Until ${formatImpactDate(end)}`;
}

const pill = "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium";

const STATUS_STYLE: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "border-border bg-muted/60 text-muted-foreground" },
  planning: { label: "Planning", tone: "border-border bg-muted/60 text-muted-foreground" },
  upcoming: { label: "Upcoming", tone: "border-info/20 bg-info/10 text-info" },
  active: { label: "Active", tone: "border-success/20 bg-success/10 text-success" },
  completed: { label: "Completed", tone: "border-primary/20 bg-primary/10 text-primary" },
  cancelled: { label: "Cancelled", tone: "border-danger/20 bg-danger/10 text-danger" },
};
/** Program statuses that have not produced results yet. */
export const NOT_STARTED = new Set(["draft", "planning", "upcoming"]);

export function ProgramStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? { label: titleCase(status), tone: STATUS_STYLE.draft.tone };
  return <span className={`${pill} ${style.tone}`}>{style.label}</span>;
}

const STATE_STYLE: Record<string, { label: string; tone: string }> = {
  completed: { label: "Completed", tone: "border-success/20 bg-success/10 text-success" },
  upcoming: { label: "Upcoming", tone: "border-info/20 bg-info/10 text-info" },
  overdue: { label: "Overdue", tone: "border-danger/20 bg-danger/10 text-danger" },
  cancelled: { label: "Cancelled", tone: "border-border bg-muted/60 text-muted-foreground" },
};

export function FollowUpStateBadge({ state }: { state: string }) {
  const style = STATE_STYLE[state] ?? STATE_STYLE.upcoming;
  return <span className={`${pill} ${style.tone}`}>{style.label}</span>;
}

export function FlagBadges({ flags }: { flags: readonly ImpactFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span key={flag} className={`${pill} ${flag === "overdue_follow_up" ? "border-danger/20 bg-danger/10 text-danger" : "border-warning/20 bg-warning/10 text-warning"}`}>
          {IMPACT_FLAG_LABEL[flag]}
        </span>
      ))}
    </span>
  );
}

/** "in_progress" → "In progress". */
export const sentenceCase = (value: string) => {
  const text = value.replace(/[_-]+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : text;
};

/** The official SDG color square with the goal number, then the goal name (or just the square when compact). */
export function SdgBadge({ goal, compact = false }: { goal: number; compact?: boolean }) {
  const label = SDG_LABELS[goal] ?? `SDG ${goal}`;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground" title={`SDG ${goal} · ${label}`}>
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-bold text-white" style={{ backgroundColor: SDG_COLORS[goal] ?? "#6B5B3E" }}>{goal}</span>
      {!compact && <span>{label}</span>}
    </span>
  );
}

const NEED_STATUS_STYLE: Record<string, string> = {
  identified: "border-border bg-muted/60 text-muted-foreground",
  in_progress: "border-info/20 bg-info/10 text-info",
  addressed: "border-success/20 bg-success/10 text-success",
};

/** A community need's delivery status: Identified, In progress, or Addressed. */
export function NeedStatusBadge({ status }: { status: string }) {
  return <span className={`${pill} ${NEED_STATUS_STYLE[status] ?? NEED_STATUS_STYLE.identified}`}>{sentenceCase(status)}</span>;
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className={`${pill} border-border bg-background font-normal text-muted-foreground`}>{children}</span>;
}

/** "2 of 3 done", with a red overdue count when there is one. */
export function FollowUpCount({ completed, total, overdue }: { completed: number; total: number; overdue: number; upcoming?: number }) {
  if (total === 0) return <span className="text-muted-foreground">None scheduled</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="tabular-nums">{completed} of {total} done</span>
      {overdue > 0 && <span className={`${pill} border-danger/20 bg-danger/10 text-danger`}>{overdue} overdue</span>}
    </span>
  );
}

/**
 * People reached against the proposal's target. Green at 100% or more,
 * primary from 50%, warning below; no bar when there is no target, and
 * "Not started" for programs that cannot have results yet.
 */
export function ReachBar({ reached, planned, percent, status, size = "sm" }: {
  reached: number; planned: number | null; percent: number | null; status?: string; size?: "sm" | "lg";
}) {
  if (status && NOT_STARTED.has(status) && reached === 0) {
    return <span className="text-xs text-muted-foreground">Not started{planned ? ` · target ${planned.toLocaleString()}` : ""}</span>;
  }
  const label = planned && percent !== null
    ? `${reached.toLocaleString()} of ${planned.toLocaleString()} · ${Math.round(percent)}%`
    : `${reached.toLocaleString()} reached · no target`;
  const fill = percent !== null && percent >= 100 ? "bg-success" : percent !== null && percent >= 50 ? "bg-primary" : "bg-warning";
  const bar = planned && percent !== null && (
    <span className={`block overflow-hidden rounded-full bg-muted ${size === "lg" ? "h-2.5 w-full" : "h-1.5 w-20 shrink-0"}`}>
      <span className={`block h-full rounded-full ${fill}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </span>
  );
  if (size === "lg") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-foreground tabular-nums">{label}</p>
        {bar}
      </div>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">{label}</span>
      {bar}
    </span>
  );
}

/** A list table inside a card, so list pages match the rest of the dashboard. */
export function TableCard({ toolbar, children }: { toolbar?: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-0 border-border py-0 shadow-card">
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">{toolbar}</div>}
      {children}
    </Card>
  );
}

export const filterInputClass = "h-9 min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
export const filterSelectClass = "h-9 max-w-[12rem] truncate rounded-lg border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
export const tableHeadClass = "border-b border-border bg-surface-alt/50 text-left text-muted-foreground";
export const thClass = "px-4 py-3 font-medium";

export const IMPACT_GLOSSARY = [
  { term: "People reached", definition: "The total of \"Beneficiaries reached\" results recorded for a program. Voided records are left out." },
  { term: "Target", definition: "The expected beneficiaries in the program's approved proposal. A program without a proposal, or with 0 expected, has no target." },
  { term: "Results recorded", definition: "Every metric entry for the program, including outputs such as trainings conducted or materials distributed." },
  { term: "Stories", definition: "Testimonials, case studies, before-and-after narratives, and observations." },
  { term: "Follow-ups", definition: "Return visits after a program. Overdue means the scheduled date passed without completion. Cancelled follow-ups are not counted." },
  { term: "Needs attention", definition: "A completed program with no results, a program with an overdue follow-up, or a completed program that reached under half its target." },
  { term: "SDG contribution", definition: "SDGs a program planned (from its proposal) and the contributions recorded for it once it started." },
  { term: "Target figure", definition: "A community profile figure the program aims to lower. Change is shown once a newer profile exists; until then only the current value is shown." },
];
