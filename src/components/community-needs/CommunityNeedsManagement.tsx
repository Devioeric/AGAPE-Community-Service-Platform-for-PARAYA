"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock, Plus, Search, XCircle } from "lucide-react";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { hasCapability } from "@/lib/auth/capabilities";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NeedCard, type CommunityNeedRow } from "./NeedCard";
import { NeedDecisionDialog } from "./NeedDecisionDialog";
import { ProfileSignalsPanel } from "@/components/community-profile/ProfileSignalsPanel";

type Barangay = { id: string; name: string };
const categories = ["health", "livelihood", "education", "infrastructure", "environment"] as const;
const statuses = ["all", "pending_paraya_review", "needs_revision", "approved", "rejected"] as const;
type NeedStatus = typeof statuses[number];
const statusOptionLabel: Record<NeedStatus, string> = {
  all: "All statuses", pending_paraya_review: "Pending review", needs_revision: "Needs revision", approved: "Approved", rejected: "Rejected",
};
type ReviewStatus = Exclude<NeedStatus, "all">;
type StatusCounts = Record<ReviewStatus, number>;
// Summary cards double as the status filter; the matching card is highlighted.
const STATUS_CARDS: ReadonlyArray<{ key: ReviewStatus; label: string; sub: string; icon: typeof Clock; accent: string }> = [
  { key: "pending_paraya_review", label: "Pending review", sub: "Waiting for a PARAYA decision", icon: Clock, accent: "border-l-warning" },
  { key: "needs_revision", label: "Needs revision", sub: "Returned to the submitter", icon: AlertCircle, accent: "border-l-info" },
  { key: "approved", label: "Approved", sub: "Ready for program planning", icon: CheckCircle2, accent: "border-l-success" },
  { key: "rejected", label: "Rejected", sub: "Closed without approval", icon: XCircle, accent: "border-l-danger" },
];
// Needs that still need someone's attention come first.
const STATUS_ORDER: Record<string, number> = { pending_paraya_review: 0, needs_revision: 1, approved: 2, rejected: 3 };
const empty = { title: "", description: "", barangay_id: "", category: "health", priority: "medium", sitio: "", affected_count: "" };
const selectStyle = "h-10 w-full rounded border bg-background px-3 text-sm";
// Capped so a long barangay name cannot push the filters onto a second line.
const filterSelectStyle = "h-9 max-w-[10.5rem] truncate rounded-lg border border-border bg-background px-2.5 text-sm";

const sentenceCase = (value: string) => value[0].toUpperCase() + value.slice(1);

function parseCounts(value: unknown): StatusCounts | null {
  if (!value || typeof value !== "object") return null;
  const counts = value as Record<string, unknown>;
  return STATUS_CARDS.every(({ key }) => typeof counts[key] === "number") ? counts as StatusCounts : null;
}

function isNeedStatus(value: string): value is NeedStatus {
  return (statuses as readonly string[]).includes(value);
}

function isNeed(value: unknown): value is CommunityNeedRow {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.title === "string" && typeof item.approval_status === "string";
}

export function CommunityNeedsManagement({ suggestionsEnabled = false }: { suggestionsEnabled?: boolean } = {}) {
  const actor = useDashboardActor();
  const canManage = hasCapability(actor.role, actor.permissions, "community_need.manage");
  const canReview = hasCapability(actor.role, actor.permissions, "community_need.validate");
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const observationId = search.get("seed_observation_id");
  const loadedObservation = useRef<string | null>(null);
  const requestedStatus = search.get("status") ?? "all";
  const [needs, setNeeds] = useState<CommunityNeedRow[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [form, setForm] = useState(empty);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<NeedStatus>(isNeedStatus(requestedStatus) ? requestedStatus : "all");
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [barangayFilter, setBarangayFilter] = useState("");
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotionReady, setPromotionReady] = useState(!observationId);
  const [listAttempt, setListAttempt] = useState(0);
  const [listDenied, setListDenied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<CommunityNeedRow | null>(null);
  const [decisionAction, setDecisionAction] = useState<"reject" | "needs_revision">("reject");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const reloadList = () => setListAttempt((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError(null); setNeeds([]); setListDenied(false);
      try {
        const response = await fetch(`/api/community-needs?status=${encodeURIComponent(status)}`, { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) { window.location.assign("/login"); return; }
        if (response.status === 403) { setListDenied(true); setError("You do not have access to this list."); return; }
        if (!response.ok) throw new Error("Community needs are temporarily unavailable. If retrying does not help, contact the administrator.");
        const payload: unknown = await response.json();
        const data = payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : null;
        if (!data || !data.every(isNeed)) throw new Error("Community needs are temporarily unavailable.");
        if (!controller.signal.aborted) { setNeeds(data); setCounts(parseCounts((payload as { counts?: unknown }).counts)); }
      } catch { if (!controller.signal.aborted) setError("Community needs are temporarily unavailable. If retrying does not help, contact the administrator."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [status, listAttempt]);

  // A notification link can change ?status= while this page stays mounted.
  useEffect(() => {
    const next = isNeedStatus(requestedStatus) ? requestedStatus : "all";
    setStatus((current) => (current === next ? current : next));
  }, [requestedStatus]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/partnerships", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load participating barangays");
        const data = await response.json();
        if (!cancelled) setBarangays(data.data ?? []);
        if (observationId && loadedObservation.current !== observationId) {
          const observationResponse = await fetch("/api/field-observations", { cache: "no-store" });
          if (!observationResponse.ok) throw new Error("Unable to load observation for promotion");
          const rows = (await observationResponse.json()).data as Array<{ id: string; observation: string; barangay_id: string; sitio: string | null; category: string; promoted_to_need_id: string | null }>;
          const observation = rows.find((row) => row.id === observationId);
          if (!observation || observation.promoted_to_need_id) throw new Error("Observation is missing or has already been promoted");
          if (!cancelled) {
            loadedObservation.current = observationId;
            const mappedCategory = observation.category === "environmental" ? "environment" : observation.category === "economic" ? "livelihood" : observation.category;
            setForm({ ...empty, title: observation.observation.slice(0, 80), description: observation.observation.slice(0, 2000), barangay_id: observation.barangay_id ?? "", sitio: observation.sitio ?? "", category: categories.includes(mappedCategory as typeof categories[number]) ? mappedCategory : "" });
            setPromotionReady(true);
            setFormOpen(true);
          }
        }
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load intake setup"); }
    })();
    return () => { cancelled = true; };
  }, [canManage, observationId]);

  // Once the promoted observation leaves the URL, the form takes ordinary needs again.
  useEffect(() => { if (!observationId) setPromotionReady(true); }, [observationId]);

  function replaceParams(update: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(search.toString());
    update(params);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }

  function changeStatus(next: NeedStatus) {
    setStatus(next);
    replaceParams((params) => { if (next === "all") params.delete("status"); else params.set("status", next); });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (saving || !promotionReady) return;
    setSaving(true); setFormError(null);
    try {
      const response = await fetch("/api/community-needs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, affected_count: form.affected_count === "" ? null : Number(form.affected_count), ...(observationId ? { observation_id: observationId } : {}) }) });
      if (!response.ok) throw new Error((await response.json()).error ?? "Unable to submit need");
      toast.success("Submitted for PARAYA Officer review");
      setForm(empty); setFormOpen(false); reloadList();
      if (observationId) { setPromotionReady(false); replaceParams((params) => params.delete("seed_observation_id")); }
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "Unable to submit need"); }
    finally { setSaving(false); }
  }

  async function approve(need: CommunityNeedRow) {
    setBusyId(need.id);
    try {
      const response = await fetch(`/api/community-needs/${need.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Unable to approve this need.");
      toast.success("Community need approved by PARAYA."); reloadList();
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to approve this need."); }
    finally { setBusyId(null); }
  }

  function openDecision(need: CommunityNeedRow, action: "reject" | "needs_revision") {
    setDecisionTarget(need); setDecisionAction(action); setDecisionNotes("");
  }

  async function submitDecision() {
    if (!decisionTarget || decisionNotes.trim().length < 3) return;
    setDecisionSubmitting(true);
    try {
      const response = await fetch(`/api/community-needs/${decisionTarget.id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: decisionNotes.trim(), action: decisionAction }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Unable to submit the decision.");
      toast.success(decisionAction === "needs_revision" ? "Marked for revision." : "Rejected.");
      setDecisionTarget(null); setDecisionNotes(""); reloadList();
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to submit the decision."); }
    finally { setDecisionSubmitting(false); }
  }

  const query = filter.trim().toLowerCase();
  const visibleNeeds = needs
    .filter((need) => !query || need.title.toLowerCase().includes(query) || (need.description ?? "").toLowerCase().includes(query))
    .filter((need) => !categoryFilter || need.category === categoryFilter)
    .filter((need) => !barangayFilter || need.barangays?.name === barangayFilter)
    .slice()
    .sort((a, b) => (STATUS_ORDER[a.approval_status] ?? 9) - (STATUS_ORDER[b.approval_status] ?? 9) || String(b.created_at).localeCompare(String(a.created_at)));
  const barangayNames = Array.from(new Set(needs.map((need) => need.barangays?.name).filter((name): name is string => Boolean(name)))).sort();
  // Without server totals, the unfiltered list is enough to count each status.
  const statusCount = (key: ReviewStatus) => counts?.[key] ?? (status === "all" ? needs.filter((need) => need.approval_status === key).length : null);
  const filtersActive = Boolean(query || categoryFilter || barangayFilter || status !== "all");
  const showSignals = suggestionsEnabled && canManage && hasCapability(actor.role, actor.permissions, "profiling.aggregate.read");
  return <div className="space-y-5">
    <SectionTabs section="officer.community-needs" label="Community Needs sections" actions={canManage ? <Button size="sm" className="h-8 gap-1.5 bg-primary text-white hover:bg-primary-dark" onClick={() => { setFormError(null); setFormOpen(true); }}><Plus className="h-4 w-4" aria-hidden="true" />Submit a need</Button> : undefined} />
    {error && <p role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">{error}{!listDenied && <Button variant="outline" size="sm" onClick={reloadList}>Retry list</Button>}</p>}
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {STATUS_CARDS.map(({ key, label, sub, icon: Icon, accent }) => {
        const active = status === key;
        const value = statusCount(key);
        return <button key={key} type="button" data-status={key} aria-pressed={active} onClick={() => changeStatus(active ? "all" : key)}
          className={`rounded-xl border border-l-4 bg-card px-4 py-3 text-left shadow-card transition-colors hover:bg-surface-alt/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${accent} ${active ? "bg-surface-alt/60 ring-1 ring-primary/30" : ""}`}>
          <span className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" aria-hidden="true" />{label}</span>
          <span className="block font-heading text-2xl font-bold leading-tight text-foreground tabular-nums">{value ?? "—"}</span>
          <span className="block text-xs text-muted-foreground">{active ? "Filtering the list · click to show all" : sub}</span>
        </button>;
      })}
    </div>
    <div className={showSignals ? "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]" : undefined}>
      <Card className="gap-0 border-border py-0 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Search community needs" className="h-9 pl-8" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search needs" />
          </div>
          <select aria-label="Need review status" className={filterSelectStyle} value={status} onChange={(event) => { const value = event.target.value; if (isNeedStatus(value)) changeStatus(value); }}>{statuses.map((value) => <option key={value} value={value}>{statusOptionLabel[value]}</option>)}</select>
          <select aria-label="Need category" className={filterSelectStyle} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{sentenceCase(category)}</option>)}</select>
          {barangayNames.length > 1 && <select aria-label="Need barangay" className={filterSelectStyle} value={barangayFilter} onChange={(event) => setBarangayFilter(event.target.value)}><option value="">All barangays</option>{barangayNames.map((name) => <option key={name} value={name}>{name}</option>)}</select>}
          {filtersActive && <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFilter(""); setCategoryFilter(""); setBarangayFilter(""); changeStatus("all"); }}>Clear</Button>}
        </div>
        {loading ? <p role="status" className="px-5 py-12 text-center text-sm text-muted-foreground">Loading community needs…</p>
          : visibleNeeds.length === 0 ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">No community needs match this status or search.</p>
            : <PaginatedTable rows={visibleNeeds} label="Community needs" resetKey={JSON.stringify([status, query, categoryFilter, barangayFilter])}>
              {(pageRows) => <ul aria-label="Community needs" className="divide-y divide-border/70">{pageRows.map((need) => <NeedCard key={need.id} need={need} canReview={canReview} busy={busyId === need.id} onApprove={(value) => void approve(value)} onDecision={openDecision} />)}</ul>}
            </PaginatedTable>}
      </Card>
      {showSignals && <ProfileSignalsPanel onNeedCreated={reloadList} />}
    </div>
    {canManage && <Dialog open={formOpen} onOpenChange={(open) => { if (!saving) setFormOpen(open); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="font-heading">{observationId ? "Promote field observation" : "Submit a community need"}</DialogTitle>
        <DialogDescription>The need goes to the PARAYA Officer review queue before it can be used for planning.</DialogDescription>
      </DialogHeader>
      <form id="community-need-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      {formError && <p role="alert" className="rounded border border-warning p-3 text-sm sm:col-span-2">{formError}</p>}
      <label>Barangay<select required className={selectStyle} value={form.barangay_id} onChange={(event) => setForm((value) => ({ ...value, barangay_id: event.target.value }))}><option value="">Select barangay</option>{barangays.map((barangay) => <option key={barangay.id} value={barangay.id}>{barangay.name}</option>)}</select></label>
      <label>Category<select required className={selectStyle} value={form.category} onChange={(event) => setForm((value) => ({ ...value, category: event.target.value }))}><option value="">Select category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label className="sm:col-span-2">Title<Input required minLength={3} maxLength={180} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} /></label>
      <label className="sm:col-span-2">Description<Textarea required minLength={10} maxLength={2000} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} /></label>
      <label>Priority<select className={selectStyle} value={form.priority} onChange={(event) => setForm((value) => ({ ...value, priority: event.target.value }))}>{["low", "medium", "high", "critical"].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
      <label>Affected people (optional)<Input type="number" min={0} max={1000000} step={1} value={form.affected_count} onChange={(event) => setForm((value) => ({ ...value, affected_count: event.target.value }))} /></label>
      <label>Sitio (optional)<Input maxLength={120} value={form.sitio} onChange={(event) => setForm((value) => ({ ...value, sitio: event.target.value }))} /></label>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
        <Button type="submit" form="community-need-form" className="bg-primary text-white hover:bg-primary-dark" disabled={saving || !promotionReady}>{saving ? "Submitting…" : "Submit for Officer review"}</Button>
      </DialogFooter>
    </DialogContent></Dialog>}
    <NeedDecisionDialog need={decisionTarget} action={decisionAction} notes={decisionNotes} submitting={decisionSubmitting} onNotesChange={setDecisionNotes} onClose={() => setDecisionTarget(null)} onSubmit={() => void submitDecision()} />
  </div>;
}
