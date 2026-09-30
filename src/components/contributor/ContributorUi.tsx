"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, ChevronRight, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SDG_COLORS, SDG_LABELS } from "@/lib/constants";
import { PIPELINE_STAGES, statusBadge, statusLabel } from "@/lib/contributor/proposal-status";
import type { ContributorOverview } from "@/lib/contributor/overview";
import { phase2Api } from "@/components/phase2/Phase2Ui";
import type { ContributorCatalog } from "./ContributorProposalForm";

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function peso(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return <Badge className={`${statusBadge(status)} text-xs ${className}`}>{statusLabel(status)}</Badge>;
}

export function SdgChips({ sdgs }: { sdgs: number[] }) {
  if (sdgs.length === 0) return null;
  return (
    <div className="flex gap-1 mt-1 flex-wrap">
      {sdgs.map((n) => (
        <span key={n} title={SDG_LABELS[n] ?? `SDG ${n}`} className="text-[11px] font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: SDG_COLORS[n] ?? "#6B6356" }}>
          SDG {n}
        </span>
      ))}
    </div>
  );
}

/** The structured review path, in the same chip style as the Officer proposal list. */
export function PipelineStepper({ status }: { status: string }) {
  if (status === "rejected") {
    return <div className="flex items-center gap-2 text-sm text-danger font-medium"><XCircle className="w-4 h-4" /> Not approved</div>;
  }
  if (status === "revisions_requested") {
    return <div className="flex items-center gap-2 text-sm text-accent-foreground font-medium"><RotateCcw className="w-4 h-4" /> Revisions requested</div>;
  }
  const activeIndex = PIPELINE_STAGES.findIndex((stage) => stage.key === status);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PIPELINE_STAGES.map((stage, index) => {
        const done = index < activeIndex || status === "approved";
        const current = index === activeIndex && status !== "approved";
        return (
          <div key={stage.key} className="flex items-center gap-1">
            <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${done ? "bg-success/15 text-success" : current ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
              {done && <CheckCircle className="w-3 h-3" />}
              {stage.label}
            </div>
            {index < PIPELINE_STAGES.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

let catalogRequest: Promise<ContributorCatalog> | null = null;

/** The proposal catalog, fetched once per page session and shared by the form and detail views. */
export function loadContributorCatalog(): Promise<ContributorCatalog> {
  catalogRequest ??= phase2Api<ContributorCatalog>("/api/v2/proposals/catalog").catch((error) => {
    catalogRequest = null;
    throw error;
  });
  return catalogRequest;
}

/** Loads /api/contributor/overview; `reload` refetches after a save or submission. */
export function useContributorOverview() {
  const [data, setData] = useState<ContributorOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/contributor/overview", { cache: "no-store" });
      const body = await response.json().catch(() => null) as { data?: ContributorOverview; error?: string } | null;
      if (!response.ok || !body?.data) throw new Error(body?.error ?? "Your proposals could not be loaded.");
      setData(body.data);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your proposals could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload };
}
