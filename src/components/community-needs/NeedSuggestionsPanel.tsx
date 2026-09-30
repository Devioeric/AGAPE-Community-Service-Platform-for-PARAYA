"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Database, Lightbulb, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NeedSuggestion } from "@/lib/community-needs/need-suggestions";
import { NeedSuggestionDecisionDialog } from "./NeedSuggestionDecisionDialog";

type SuggestionBarangay = {
  barangayId: string;
  barangayName: string;
  status: "ready" | "unavailable";
  cycle: { id: string; name: string; reportingDate: string } | null;
  sample: { approvedHouseholds: number; approvedResidents: number } | null;
  suggestions: NeedSuggestion[];
  decidedCount: number;
  trackedCount: number;
};

type ResponsePayload = {
  data?: {
    status?: "ready" | "disabled";
    reason?: string;
    barangays?: SuggestionBarangay[];
  };
  error?: string;
};

function reportingDate(value: string | undefined) {
  if (!value) return "Reporting date unavailable";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function disabledMessage(reason: string | undefined) {
  if (reason === "profiling_runtime_off") return "Data-derived suggestions are unavailable while profiling runtime is off.";
  if (reason === "profiling_disabled") return "Data-derived suggestions appear when resident profiling is enabled and a profiling cycle has been completed.";
  return "Data-derived suggestions are currently disabled for this environment.";
}

export function NeedSuggestionsPanel({ onNeedCreated }: { onNeedCreated: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "disabled" | "empty" | "error">("loading");
  const [barangays, setBarangays] = useState<SuggestionBarangay[]>([]);
  const [reason, setReason] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selected, setSelected] = useState<{ suggestion: NeedSuggestion; mode: "accept" | "dismiss" } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading"); setError(null);
    try {
      const response = await fetch("/api/need-suggestions", { cache: "no-store", signal });
      const payload = await response.json().catch(() => ({})) as ResponsePayload;
      if (!response.ok) throw new Error(payload.error ?? "Data-derived suggestions are temporarily unavailable.");
      if (payload.data?.status === "disabled") {
        setReason(payload.data.reason); setBarangays([]); setState("disabled"); return;
      }
      if (payload.data?.status !== "ready" || !Array.isArray(payload.data.barangays)) {
        throw new Error("Data-derived suggestions returned an invalid response. Please retry.");
      }
      const rows = payload.data.barangays;
      setBarangays(rows);
      // Keep unavailable cycle rows visible. Treating an all-unavailable
      // response as an empty result would incorrectly imply that the source
      // loaded successfully and simply had no qualifying signals.
      setState(rows.length > 0 ? "ready" : "empty");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Data-derived suggestions are temporarily unavailable.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshToken]);

  const refresh = () => setRefreshToken((value) => value + 1);
  return (
    <Card className="border-primary/20 bg-primary/[0.02] shadow-none">
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 font-heading text-base"><Lightbulb className="h-4 w-4 text-primary" />Suggested from profiling data</CardTitle>
            <CardDescription className="mt-1">Rule-based signals from approved, de-identified profiling aggregates. Suggestions are advisory; nothing is created until you accept.</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh} disabled={state === "loading"}><RefreshCw className={`h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {state === "loading" && <p role="status" className="text-sm text-muted-foreground">Loading data-derived suggestions…</p>}
        {state === "disabled" && <p className="text-sm text-muted-foreground">{disabledMessage(reason)}</p>}
        {state === "error" && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"><AlertCircle className="h-4 w-4 text-warning" />{error}<Button variant="outline" size="sm" onClick={refresh}>Retry</Button></div>}
        {state === "ready" && barangays.map((barangay) => (
          <div key={barangay.barangayId} className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="font-medium">{barangay.barangayName}</h3><p className="text-xs text-muted-foreground">{barangay.cycle?.name ?? "Latest completed cycle"} · {reportingDate(barangay.cycle?.reportingDate)}</p></div>
              {barangay.sample && <div className="text-right text-xs text-muted-foreground"><p>{barangay.sample.approvedHouseholds.toLocaleString()} households · {barangay.sample.approvedResidents.toLocaleString()} residents sampled</p><p>Sample-based, not a census</p></div>}
            </div>
            {(barangay.decidedCount > 0 || barangay.trackedCount > 0) && <p className="text-xs text-muted-foreground">{barangay.decidedCount ? `${barangay.decidedCount} already decided` : ""}{barangay.decidedCount && barangay.trackedCount ? " · " : ""}{barangay.trackedCount ? `${barangay.trackedCount} already tracked` : ""}</p>}
            {barangay.status === "unavailable" ? <p className="rounded border border-warning/30 bg-warning/5 p-2 text-sm text-muted-foreground">This profiling cycle could not be loaded. Other Barangays remain available.</p> : barangay.suggestions.map((suggestion) => (
              <div key={suggestion.fingerprint} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1"><h4 className="font-medium">{suggestion.title}</h4><div className="mt-1 flex flex-wrap gap-1.5"><Badge variant="outline" className="capitalize">{suggestion.category}</Badge><Badge variant="outline">Suggested priority: {suggestion.priority}</Badge><Badge variant="outline">{suggestion.confidence} confidence</Badge></div></div>
                  <div className="text-right text-xs text-muted-foreground"><p>Rule: ≥{suggestion.threshold}%</p>{suggestion.interval && <p>95% interval {suggestion.interval.low}–{suggestion.interval.high}% (indicative; assumes a random sample)</p>}</div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{suggestion.description.split(" Source:")[0]}</p>
                <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => setSelected({ suggestion, mode: "accept" })}>Accept as need</Button><Button variant="outline" size="sm" onClick={() => setSelected({ suggestion, mode: "dismiss" })}>Dismiss</Button></div>
              </div>
            ))}
          </div>
        ))}
        {state === "ready" && barangays.length > 0 && barangays.every((barangay) => barangay.status === "ready" && barangay.suggestions.length === 0) && <p className="text-sm text-muted-foreground">No profiling signals meet the current thresholds for the latest completed cycles.</p>}
        {state === "empty" && <p className="text-sm text-muted-foreground">No completed profiling cycles are available for suggestions.</p>}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Database className="h-3 w-3" />Only aggregate, de-identified profiling evidence is used.</p>
      </CardContent>
      <NeedSuggestionDecisionDialog suggestion={selected?.suggestion ?? null} mode={selected?.mode ?? "accept"} onClose={() => setSelected(null)} onCompleted={() => { onNeedCreated(); refresh(); }} />
    </Card>
  );
}
