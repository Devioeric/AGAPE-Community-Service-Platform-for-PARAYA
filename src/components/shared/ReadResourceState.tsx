"use client";

import type { ReadStatus } from "@/lib/read-resource";

export function ReadResourceState({ status, label, retry }: { status: ReadStatus; label: string; retry: () => unknown }) {
  if (status === "denied" || status === "success") return null;
  if (status === "loading" || status === "idle") return <div aria-busy="true" aria-label={`Loading ${label}`} className="space-y-2 p-4">
    <div className="h-5 w-2/3 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted" />
  </div>;
  return <div role="status" className="p-4 text-sm text-muted-foreground">
    <p>{label} could not be loaded.</p>
    <button type="button" className="mt-2 rounded px-2 py-1 text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => void retry()}>Retry {label.toLowerCase()}</button>
  </div>;
}
