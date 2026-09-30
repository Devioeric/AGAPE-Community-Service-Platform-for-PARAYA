"use client";

import type { ComponentType, ReactNode } from "react";
import { ClipboardList, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Shared building blocks for record pages (Community Profile, impact reports).

type Icon = ComponentType<{ className?: string }>;

/** A KPI tile in the same style as the Analytics cards. */
export function StatCard({ icon: Icon, label, value, sub, accent }: { icon: Icon; label: string; value: ReactNode; sub?: ReactNode; accent: string }) {
  return (
    <Card className={`border-border border-l-4 shadow-card ${accent}`}>
      <CardContent className="px-4 py-3">
        <div className="mb-1 flex items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-snug text-muted-foreground">{label}</p>
        </div>
        <p className="font-heading text-2xl font-bold leading-tight text-foreground tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/** The record's name, a detail line, and actions at the top of a record page. */
export function RecordHeader({ name, detail, actions, children, icon: Icon = MapPin }: {
  name: string; detail: ReactNode; actions?: ReactNode; children?: ReactNode; icon?: Icon;
}) {
  return (
    <Card className="border-border shadow-card">
      <CardContent className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-alt text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-xl font-semibold leading-tight text-foreground">{name}</h2>
              <div className="mt-0.5 text-sm text-muted-foreground">{detail}</div>
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ title, children, action, icon: Icon = ClipboardList }: { title: string; children: ReactNode; action?: ReactNode; icon?: Icon }) {
  return (
    <Card className="border-border shadow-card">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-alt text-primary">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="font-heading text-lg font-semibold text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{children}</p>
        {action}
      </CardContent>
    </Card>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
