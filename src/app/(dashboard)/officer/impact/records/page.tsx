"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { FollowUpDialog, IndicatorDialog, StoryDialog, VoidRecordDialog, completeFollowUp, type VoidTarget } from "@/components/impact/ImpactRecordDialogs";
import {
  FollowUpStateBadge, TableCard, filterSelectClass, followUpTypeLabel, formatImpactDate,
  indicatorLabel, storyTypeLabel, tableHeadClass, thClass,
} from "@/components/impact/ImpactUi";
import { followUpState } from "@/lib/analytics/insights";
import { hasCapability } from "@/lib/auth/capabilities";

type Program = { id: string; title: string; barangay_id?: string | null; barangays?: { name: string } | null };
type Indicator = { id: string; program_id: string; indicator_type: string; value: number; unit: string; recorded_date: string; notes?: string | null; programs?: { title: string } | null };
type Story = { id: string; program_id: string; type: string; content: string; recorded_date: string; programs?: { title: string } | null };
type FollowUp = { id: string; program_id: string; followup_type: string; status: string; notes?: string | null; scheduled_date: string; completed_date?: string | null; programs?: { title: string } | null };
type Tab = "metrics" | "stories" | "followups";

const TABS: ReadonlyArray<{ key: Tab; label: string; add: string }> = [
  { key: "metrics", label: "Impact metrics", add: "Record a result" },
  { key: "stories", label: "Stories", add: "Record a story" },
  { key: "followups", label: "Follow-ups", add: "Schedule a follow-up" },
];

const ProgramLink = ({ id, title }: { id: string; title?: string | null }) => (
  <Link href={`/officer/impact/programs/${id}`} prefetch={false} className="text-foreground underline-offset-4 hover:text-primary hover:underline">{title ?? "Program"}</Link>
);

/** Bookkeeping for impact: every metric, story, and follow-up, with add, mark done, and void. */
export default function ImpactRecordsPage() {
  const actor = useDashboardActor();
  const canManage = hasCapability(actor.role, actor.permissions, "impact.manage");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [tab, setTab] = useState<Tab>("metrics");
  const [programFilter, setProgramFilter] = useState("");
  const [barangayFilter, setBarangayFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"metric" | "story" | "followup" | null>(null);
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const responses = await Promise.all(["/api/programs", "/api/impact", "/api/impact/qualitative", "/api/impact/followup"].map((url) => fetch(url, { cache: "no-store" })));
      if (responses.some((response) => !response.ok)) throw new Error("Impact records are temporarily unavailable.");
      const [programData, indicatorData, storyData, followUpData] = await Promise.all(responses.map((response) => response.json()));
      setPrograms(programData.data ?? []);
      setIndicators(indicatorData.data ?? []);
      setStories(storyData.data ?? []);
      setFollowUps(followUpData.data ?? []);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Impact records are temporarily unavailable."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // A program report can link here with ?program=<id>.
    setProgramFilter(new URLSearchParams(window.location.search).get("program") ?? "");
    void load();
  }, [load]);

  const barangays = useMemo(() => Array.from(new Map(programs.filter((program) => program.barangay_id).map((program) => [program.barangay_id as string, program.barangays?.name ?? "Unassigned"])).entries())
    .sort((a, b) => a[1].localeCompare(b[1])), [programs]);
  const programIds = new Set(programs
    .filter((program) => !programFilter || program.id === programFilter)
    .filter((program) => !barangayFilter || program.barangay_id === barangayFilter)
    .map((program) => program.id));
  const visibleIndicators = indicators.filter((row) => programIds.has(row.program_id));
  const visibleStories = stories.filter((row) => programIds.has(row.program_id));
  const visibleFollowUps = followUps.filter((row) => programIds.has(row.program_id));
  const counts: Record<Tab, number> = { metrics: visibleIndicators.length, stories: visibleStories.length, followups: visibleFollowUps.length };
  const resetKey = JSON.stringify([programFilter, barangayFilter, tab]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const programOptions = programs.map((program) => ({ id: program.id, title: program.title }));
  const current = TABS.find((item) => item.key === tab) ?? TABS[0];

  const markDone = async (row: FollowUp) => {
    if (!canManage || updating) return;
    setUpdating(row.id);
    try { await completeFollowUp(row); toast.success("Follow-up marked done."); await load(); }
    catch (failure) { toast.error(failure instanceof Error ? failure.message : "The follow-up could not be updated."); }
    finally { setUpdating(null); }
  };

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p>{error}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }

  const toolbar = <>
    <div role="group" aria-label="Record type" className="flex gap-1 rounded-lg border border-border bg-surface-alt p-1 text-xs">
      {TABS.map((item) => (
        <button key={item.key} type="button" aria-pressed={tab === item.key} onClick={() => setTab(item.key)}
          className={`rounded-md px-3 py-1 font-medium transition-all ${tab === item.key ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          {item.label} <span className="tabular-nums opacity-80">{loading ? "" : counts[item.key]}</span>
        </button>
      ))}
    </div>
    <select aria-label="Filter by program" value={programFilter} onChange={(event) => setProgramFilter(event.target.value)} className={filterSelectClass}>
      <option value="">All programs</option>
      {programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
    </select>
    <select aria-label="Filter by barangay" value={barangayFilter} onChange={(event) => setBarangayFilter(event.target.value)} className={filterSelectClass}>
      <option value="">All barangays</option>
      {barangays.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
    {canManage && (
      <Button size="sm" className="ml-auto h-9" onClick={() => setDialog(tab === "metrics" ? "metric" : tab === "stories" ? "story" : "followup")}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />{current.add}
      </Button>
    )}
  </>;

  return (
    <>
      <TableCard toolbar={toolbar}>
        {loading ? <p role="status" className="px-5 py-12 text-center text-sm text-muted-foreground">Loading impact records…</p>
          : tab === "metrics" ? (
            <PaginatedTable rows={visibleIndicators} label="Impact metrics" resetKey={resetKey} loading={loading}>
              {(pageRows) => (
                <table aria-label="Impact metrics" className="w-full text-sm">
                  <thead>
                    <tr className={tableHeadClass}>
                      <th className={thClass}>Result</th>
                      <th className={`${thClass} text-right`}>Value</th>
                      <th className={thClass}>Program</th>
                      <th className={thClass}>Date</th>
                      {canManage && <th className={thClass}><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/60 last:border-0 align-top">
                        <td className="px-4 py-3">{indicatorLabel(row.indicator_type)}{row.notes && <p className="text-xs text-muted-foreground">{row.notes}</p>}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{Number(row.value).toLocaleString()} {row.unit}</td>
                        <td className="px-4 py-3"><ProgramLink id={row.program_id} title={row.programs?.title} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatImpactDate(row.recorded_date)}</td>
                        {canManage && <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => setVoidTarget({ kind: "indicator", id: row.id, label: "result" })}>Void</Button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PaginatedTable>
          ) : tab === "stories" ? (
            <PaginatedTable rows={visibleStories} label="Stories" resetKey={resetKey} loading={loading}>
              {(pageRows) => (
                <ul aria-label="Stories" className="divide-y divide-border/70">
                  {pageRows.map((row) => (
                    <li key={row.id} className="px-5 py-4">
                      <p className="text-xs text-muted-foreground">
                        {storyTypeLabel(row.type)} · {formatImpactDate(row.recorded_date)} · <ProgramLink id={row.program_id} title={row.programs?.title} />
                      </p>
                      <p className="mt-1 line-clamp-3 text-sm text-foreground">{row.content}</p>
                      {canManage && <button type="button" onClick={() => setVoidTarget({ kind: "qualitative", id: row.id, label: "story" })} className="mt-1 text-xs text-muted-foreground underline-offset-4 hover:underline">Void</button>}
                    </li>
                  ))}
                </ul>
              )}
            </PaginatedTable>
          ) : (
            <PaginatedTable rows={visibleFollowUps} label="Follow-ups" resetKey={resetKey} loading={loading}>
              {(pageRows) => (
                <table aria-label="Follow-ups" className="w-full text-sm">
                  <thead>
                    <tr className={tableHeadClass}>
                      <th className={thClass}>Visit</th>
                      <th className={thClass}>Program</th>
                      <th className={thClass}>Scheduled</th>
                      <th className={thClass}>State</th>
                      {canManage && <th className={thClass}><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => {
                      const state = followUpState(row, today);
                      return (
                        <tr key={row.id} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-3">{followUpTypeLabel(row.followup_type)}</td>
                          <td className="px-4 py-3"><ProgramLink id={row.program_id} title={row.programs?.title} /></td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatImpactDate(row.scheduled_date)}</td>
                          <td className="px-4 py-3"><FollowUpStateBadge state={state} /></td>
                          {canManage && (
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                {state !== "completed" && state !== "cancelled" && (
                                  <Button size="sm" variant="outline" className="h-7" disabled={updating !== null} onClick={() => void markDone(row)}>{updating === row.id ? "Saving…" : "Mark done"}</Button>
                                )}
                                <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" disabled={updating !== null} onClick={() => setVoidTarget({ kind: "followup", id: row.id, label: "follow-up" })}>Void</Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </PaginatedTable>
          )}
      </TableCard>

      {canManage && <>
        <IndicatorDialog open={dialog === "metric"} onOpenChange={(open) => { if (!open) setDialog(null); }} programs={programOptions} defaultProgramId={programFilter || undefined} onSaved={() => void load()} />
        <StoryDialog open={dialog === "story"} onOpenChange={(open) => { if (!open) setDialog(null); }} programs={programOptions} defaultProgramId={programFilter || undefined} onSaved={() => void load()} />
        <FollowUpDialog open={dialog === "followup"} onOpenChange={(open) => { if (!open) setDialog(null); }} programs={programOptions} defaultProgramId={programFilter || undefined} onSaved={() => void load()} />
        <VoidRecordDialog target={voidTarget} onClose={() => setVoidTarget(null)} onVoided={() => void load()} />
      </>}
    </>
  );
}
