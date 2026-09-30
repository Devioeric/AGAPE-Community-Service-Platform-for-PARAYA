"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PROFILE_SECTIONS, type ProfileSection } from "@/lib/community-profile/catalog";
export { StatCard as ProfileStatCard, RecordHeader as ProfileRecordHeader, EmptyState as ProfileEmptyState, LoadingBlock as ProfileLoading } from "@/components/shared/RecordUi";

// Shared presentation for the Community Profile list, view, and edit form.

export function formatProfileDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(date);
}


/**
 * The five report sections as underlined tabs, matching the dashboard chart
 * tabs. Only the active section is rendered.
 */
export function ProfileSectionTabs({ value, onChange, badge, children }: {
  value: string;
  onChange: (next: string) => void;
  badge?: (section: ProfileSection) => ReactNode;
  children: (section: ProfileSection) => ReactNode;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(String(next))} className="flex flex-col gap-4">
      <div className="-mx-1 overflow-x-auto border-b border-border/60 px-1">
        <TabsList variant="line" aria-label="Profile sections" className="h-11 min-w-max justify-start gap-6 p-0">
          {PROFILE_SECTIONS.map((section) => (
            <TabsTrigger
              key={section.key}
              value={section.key}
              className="h-11 flex-none rounded-none border-0 px-0 py-3 text-sm font-normal text-muted-foreground after:hidden data-[active]:font-semibold data-[active]:text-foreground focus-visible:ring-inset"
            >
              {section.title}
              {badge && <span className="rounded-full bg-surface-alt px-1.5 text-[11px] font-medium leading-5 text-muted-foreground tabular-nums">{badge(section)}</span>}
              {section.key === value && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {PROFILE_SECTIONS.map((section) => (
        <TabsContent key={section.key} value={section.key}>
          {section.key === value && children(section)}
        </TabsContent>
      ))}
    </Tabs>
  );
}


export function MultipleAnswersPill() {
  return <span className="shrink-0 rounded-full bg-surface-alt px-2 py-0.5 text-[11px] text-muted-foreground">Multiple answers</span>;
}
