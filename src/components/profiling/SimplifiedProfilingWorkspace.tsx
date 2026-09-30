"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, FileText, Filter, RefreshCw, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { hasCapability, type PermissionOverrides } from "@/lib/auth/capabilities";
import { parseProfilingSummaryResponse, type ProfilingSummaryResponse } from "@/lib/profiling/summary-contract";
import { parseSourceAggregateResponse, type SourceAggregateResponse } from "@/lib/profiling/source-aggregate-contract";
import { ProfilingWorkspace } from "./ProfilingWorkspace";
import { SectionTabs } from "@/components/layout/SectionTabs";

type Detail = {
  id: string;
  household_code: string;
  sitio_name: string;
  row_version: number;
  household_data?: Record<string, unknown>;
  residents: Array<{ resident_id: string; resident_code: string; profile: Record<string, unknown>; relationship_to_head: string | null; is_minor: boolean }>;
  consents?: Array<{ id: string; subject_type: string; status: string; privacy_notice_version: string; effective_from: string }>;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`);
  return payload.data as T;
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not stated";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "None recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).replaceAll("_", " ");
}

function residentLabel(resident: Detail["residents"][number]) {
  const first = typeof resident.profile.first_name === "string" ? resident.profile.first_name.trim() : "";
  const last = typeof resident.profile.last_name === "string" ? resident.profile.last_name.trim() : "";
  return [first, last].filter(Boolean).join(" ") || resident.resident_code || "Resident name not provided";
}

function dateLabel(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function syntheticProvenance(provenance: Record<string, unknown>) {
  const rawCounts = provenance.synthetic_profile_counts;
  const counts = rawCounts && typeof rawCounts === "object" && !Array.isArray(rawCounts)
    ? rawCounts as { households?: unknown; residents?: unknown }
    : null;
  const formatCount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "Not provided";
  return {
    households: formatCount(counts?.households),
    residents: formatCount(counts?.residents),
    officialPopulation: provenance.official_population === "not_provided" ? "Not provided by source" : "See official population record",
  };
}

function AvailabilityMessage({ state, label }: { state: ProfilingSummaryResponse["availability"]["profiling"]; label: string }) {
  if (state === "available") return null;
  const copy = state === "empty" ? `No ${label.toLowerCase()} are recorded for this scope.` : state === "suppressed" ? `${label} are hidden by the current privacy scope.` : `${label} are temporarily unavailable. Retry to load them.`;
  return <div role={state === "unavailable" ? "alert" : "status"} className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span>{copy}</span></div>;
}

function Kpi({ label, value, definition }: { label: string; value: number | null; definition: string }) {
  return <Card size="sm"><CardContent className="space-y-1 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="font-heading text-2xl font-bold">{value === null ? "Unavailable" : value.toLocaleString()}</p><p className="text-xs text-muted-foreground">{definition}</p></CardContent></Card>;
}

type ProfilingFilters = { barangayId: string; status: string; search: string };

/**
 * Filter button for the profiling overview. Status and search apply to the
 * profiling packages and the community needs list. The Officer also picks a
 * barangay; a Secretary's barangay is fixed on the server, so it is not offered.
 */
function ProfilingFilterButton({ value, statuses, barangays, onApply }: {
  value: ProfilingFilters;
  statuses: readonly string[];
  /** Omitted for the Secretary. */
  barangays?: ReadonlyArray<{ id: string; name: string }>;
  onApply: (next: ProfilingFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const cleared: ProfilingFilters = { barangayId: "", status: "all", search: "" };
  const active = (value.barangayId ? 1 : 0) + (value.status !== "all" ? 1 : 0) + (value.search.trim() ? 1 : 0);
  const draftActive = Boolean(draft.barangayId || draft.status !== "all" || draft.search.trim());
  const apply = (next: ProfilingFilters) => { onApply({ ...next, search: next.search.trim() }); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setDraft(value); }}>
      <PopoverTrigger aria-label={active ? `Filter, ${active} active` : "Filter"} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Filter className="h-4 w-4" aria-hidden="true" /> Filter
        {active > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 text-white">{active}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); apply(draft); }}>
          {barangays && (
            <label className="block space-y-1 text-xs font-semibold text-muted-foreground">Barangay
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm font-normal text-foreground" value={draft.barangayId} onChange={(event) => setDraft({ ...draft, barangayId: event.target.value })}>
                <option value="">All authorized barangays</option>
                {barangays.map((barangay) => <option key={barangay.id} value={barangay.id}>{barangay.name}</option>)}
              </select>
            </label>
          )}
          <fieldset className="space-y-0.5">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">Status</legend>
            {["all", ...statuses].map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm capitalize hover:bg-muted">
                <input type="radio" name="profiling-status-filter" value={option} checked={draft.status === option} onChange={() => setDraft({ ...draft, status: option })} />
                {option === "all" ? "All statuses" : option.replaceAll("_", " ")}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1 text-xs font-semibold text-muted-foreground">Search
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} placeholder="Household code, sitio, or need" /></div>
          </label>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={active === 0 && !draftActive} onClick={() => apply(cleared)}>Clear</Button>
            <Button type="submit" size="sm" className="bg-primary text-white hover:bg-primary-dark">Apply</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function SimplifiedProfilingWorkspace({ audience, role, permissions, sectionTabs }: {
  audience: "paraya" | "barangay"; role: string; permissions: PermissionOverrides;
  /** Section tab strip to draw at the top; the Secretary's Filter button sits at its right end. */
  sectionTabs?: { section: string; label: string };
}) {
  const [summary, setSummary] = useState<ProfilingSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [barangayId, setBarangayId] = useState("");
  const [status, setStatus] = useState("all");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [showSource, setShowSource] = useState(false);
  const [sourceData, setSourceData] = useState<SourceAggregateResponse | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourcePage, setSourcePage] = useState(1);

  const canReview = hasCapability(role, permissions, "profiling.validate");
  const isSecretary = audience === "barangay";

  const loadSummary = useCallback(async (nextPage = page) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(nextPage), page_size: "25" });
    if (barangayId) params.set("barangay_id", barangayId);
    if (status !== "all") params.set("status", status);
    if (appliedSearch.trim()) params.set("q", appliedSearch.trim());
    try {
      const data = parseProfilingSummaryResponse(await requestJson<unknown>(`/api/profiling/summary?${params.toString()}`));
      setSummary(data);
      setPage(data.profiles.page);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profiling summary is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, barangayId, page, status]);

  useEffect(() => { void loadSummary(1); }, [appliedSearch, barangayId, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSourceAggregates = useCallback(async (nextPage = sourcePage) => {
    const cycleId = summary?.scope.cycleId;
    if (!cycleId) return;
    setSourceLoading(true);
    setSourceError(null);
    try {
      const data = parseSourceAggregateResponse(await requestJson<unknown>(`/api/profiling/source-aggregates?cycle_id=${encodeURIComponent(cycleId)}&page=${nextPage}&page_size=25`));
      setSourceData(data);
      setSourcePage(data.pagination.page);
    } catch (caught) {
      setSourceError(caught instanceof Error ? caught.message : "Source aggregate data is temporarily unavailable.");
    } finally {
      setSourceLoading(false);
    }
  }, [sourcePage, summary?.scope.cycleId]);

  useEffect(() => {
    if (showSource && !sourceData) void loadSourceAggregates(1);
  }, [loadSourceAggregates, showSource, sourceData]);

  useEffect(() => {
    setSourceData(null);
    setSourceError(null);
    setSourcePage(1);
  }, [summary?.scope.cycleId]);

  const visibleProfiles = summary?.profiles.rows ?? [];

  const openDetail = async (id: string) => {
    try { setDetail(await requestJson<Detail>(`/api/profiling/submissions/${id}`)); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to load profile details"); }
  };

  const decide = async (decision: "approve" | "return") => {
    if (!detail) return;
    if (decision === "return" && returnReason.trim().length < 3) { toast.error("Add a reason before returning this package."); return; }
    try {
      await requestJson(`/api/profiling/submissions/${detail.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_version: detail.row_version, decision, reason: decision === "return" ? returnReason.trim() : null }) });
      toast.success(decision === "approve" ? "Profile package approved" : "Profile package returned");
      setDetail(null); setReturnReason(""); await loadSummary(1);
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Profile decision failed"); }
  };

  const profilePageCount = Math.max(1, Math.ceil((summary?.profiles.total ?? 0) / 25));
  const needs = summary?.needs.rows ?? [];
  // Filter for both portals, plus Refresh for the Officer; page titles live in the header breadcrumb.
  const pageActions = <div className="flex items-center gap-2">
    <ProfilingFilterButton
      value={{ barangayId, status, search: appliedSearch }}
      statuses={summary?.filters.statuses ?? []}
      barangays={isSecretary ? undefined : summary?.filters.barangays ?? []}
      onApply={(next) => { setBarangayId(next.barangayId); setStatus(next.status); setAppliedSearch(next.search); setPage(1); }}
    />
    {!isSecretary && <Button variant="outline" size="sm" className="h-8" onClick={() => void loadSummary(1)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>}
  </div>;

  return <div className="space-y-6" data-testid="simplified-profiling-workspace">
    {sectionTabs ? <SectionTabs section={sectionTabs.section} label={sectionTabs.label} actions={pageActions} /> : <div className="flex justify-end">{pageActions}</div>}

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void loadSummary(1)}>Retry</Button></div>}
    {summary?.warnings.map((warning) => <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm" key={warning}>{warning}</p>)}


    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Kpi label="Households profiled" value={summary?.kpis.totalHouseholds ?? null} definition="Approved aggregate" />
      <Kpi label="Residents profiled" value={summary?.kpis.totalResidents ?? null} definition="Approved aggregate" />
      <Kpi label="Approved packages" value={summary?.kpis.approvedPackages ?? null} definition="Ready for planning use" />
      <Kpi label="Awaiting review" value={summary?.kpis.awaitingReview ?? null} definition="Needs Officer attention" />
      <Kpi label="High-priority needs" value={summary?.kpis.highPriorityNeeds ?? null} definition="Open approved or review needs" />
    </div>
    {summary && <p className="text-xs text-muted-foreground">As of {dateLabel(summary.asOf)} · Values are status-aware and may be unavailable when a protected source cannot be read.</p>}

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Resident profiling</CardTitle></CardHeader><CardContent className="space-y-3 p-0"><div className="px-4"><AvailabilityMessage state={summary?.availability.profiling ?? (loading ? "available" : "unavailable")} label="Profiling records" /></div>{loading ? <p role="status" className="px-4 pb-4 text-sm text-muted-foreground">Loading profiling summary…</p> : visibleProfiles.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">No profiling packages match the current scope and filters.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y bg-muted/30 text-left"><th className="px-4 py-3">Household</th><th className="px-4 py-3">Barangay</th><th className="px-4 py-3">Sitio</th><th className="px-4 py-3 text-right">Residents</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody>{visibleProfiles.map((row) => <tr className="border-b last:border-0" key={row.packageId}><td className="px-4 py-3 font-mono text-xs">{row.householdCode}</td><td className="px-4 py-3">{row.barangayName}</td><td className="px-4 py-3">{row.sitio ?? "Not stated"}</td><td className="px-4 py-3 text-right">{row.residentCount ?? "—"}</td><td className="px-4 py-3"><Badge variant="outline">{row.status.replaceAll("_", " ")}</Badge>{row.returnReason && <p className="mt-1 text-xs text-danger">{row.returnReason}</p>}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => void openDetail(row.packageId)}>View details</Button></td></tr>)}</tbody></table></div>}
      {!loading && profilePageCount > 1 && <div className="flex items-center justify-between border-t px-4 py-3"><span className="text-xs text-muted-foreground">Page {summary?.profiles.page} of {profilePageCount}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => void loadSummary(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= profilePageCount} onClick={() => void loadSummary(page + 1)}>Next</Button></div></div>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Community needs</CardTitle></CardHeader><CardContent className="space-y-3"><AvailabilityMessage state={summary?.availability.needs ?? (loading ? "available" : "unavailable")} label="Community needs" />{needs.length === 0 ? <p className="text-sm text-muted-foreground">No community needs match the current scope and filters.</p> : <div className="divide-y rounded-lg border">{needs.slice(0, 8).map((need) => <div className="flex flex-wrap items-center justify-between gap-3 p-3" key={need.id}><div><p className="font-medium">{need.title}</p><p className="text-xs text-muted-foreground">{need.category.replaceAll("_", " ")} · {need.sitio ?? "General barangay scope"} · {dateLabel(need.submittedAt)}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{need.priority}</Badge><Badge>{need.status.replaceAll("_", " ")}</Badge></div></div>)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Needs remain subject to the existing human review workflow.</p><a className="text-sm font-medium underline underline-offset-4" href={isSecretary ? "/barangay/submit-needs" : "/officer/community-needs"}>{isSecretary ? "Submit a community need" : "Open Community Needs"}</a></div>
    </CardContent></Card>

    <Card data-testid="profiling-source-aggregates"><CardHeader><button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setShowSource((value) => !value)} aria-expanded={showSource}><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Source aggregate tables</CardTitle>{showSource ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></CardHeader>{showSource && <CardContent className="space-y-4 pt-0">{sourceLoading && <p role="status" className="text-sm text-muted-foreground">Loading source aggregate tables…</p>}{sourceError && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm"><span>{sourceError}</span><Button size="sm" variant="outline" onClick={() => void loadSourceAggregates(sourcePage)}>Retry</Button></div>}{!sourceLoading && !sourceError && !sourceData && <p className="text-sm text-muted-foreground">Open this section to inspect the imported aggregate source.</p>}{sourceData?.dataset && <><div className="rounded-lg border bg-muted/20 p-3 text-sm"><p className="font-medium">{sourceData.dataset.sourceTitle}</p><p className="text-muted-foreground">{sourceData.dataset.sourceLocation} · {sourceData.dataset.sourceRowCount.toLocaleString()} source rows · {sourceData.dataset.status}</p><p className="mt-1 text-xs text-muted-foreground">This source contains aggregate tables. The profile records above are deterministic synthetic reconstructions, not verified individual resident records.</p></div><div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs"><p className="font-medium">Provenance and population basis</p>{(() => { const provenance = syntheticProvenance(sourceData.dataset.provenance); return <div className="mt-1 grid gap-1 sm:grid-cols-3"><span>Synthetic households: <strong>{provenance.households}</strong></span><span>Synthetic residents: <strong>{provenance.residents}</strong></span><span>Official population: <strong>{provenance.officialPopulation}</strong></span></div>; })()}</div>{sourceData.dataset.qualityFlags.length > 0 && <div className="rounded-lg border border-warning/30 bg-warning/5 p-3"><p className="text-sm font-medium">Data-quality notes</p><ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{sourceData.dataset.qualityFlags.map((flag) => <li key={flag}>{flag.replaceAll("_", " ")}</li>)}</ul></div>}<div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b bg-muted/30 text-left"><th className="px-3 py-2">Topic</th><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Frequency</th><th className="px-3 py-2 text-right">Percentage</th><th className="px-3 py-2 text-right">Table total</th><th className="px-3 py-2">Table / notes</th></tr></thead><tbody>{sourceData.rows.map((row) => <tr className="border-b last:border-0" key={row.id}><td className="px-3 py-2">{row.topic ?? row.section ?? "Not stated"}</td><td className="px-3 py-2">{row.category ?? "Not stated"}</td><td className="px-3 py-2 text-right">{row.frequency ?? "—"}</td><td className="px-3 py-2 text-right">{row.percentageAsPrinted ?? (row.percentage === null ? "—" : `${row.percentage}%`)}</td><td className="px-3 py-2 text-right">{row.reportedTableTotal ?? "—"}</td><td className="max-w-[280px] px-3 py-2 text-xs text-muted-foreground">{[row.tableId, row.dataQualityNotes].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table></div><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Page {sourceData.pagination.page} of {Math.max(1, sourceData.pagination.totalPages)}. Source filenames and hashes are retained in the protected provenance record.</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={sourceLoading || sourcePage <= 1} onClick={() => void loadSourceAggregates(sourcePage - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={sourceLoading || sourcePage >= sourceData.pagination.totalPages} onClick={() => void loadSourceAggregates(sourcePage + 1)}>Next</Button></div></div></>}</CardContent>}</Card>

    {detail && <Card className="border-primary" data-testid="simplified-profile-detail"><CardHeader><CardTitle>Profile details · {detail.household_code}</CardTitle></CardHeader><CardContent className="space-y-5"><section><h3 className="mb-2 text-sm font-semibold">General and household information</h3><dl className="grid gap-3 sm:grid-cols-2">{Object.entries(detail.household_data ?? {}).filter(([key]) => !["contact_number"].includes(key)).map(([key, value]) => <div className="rounded border p-3" key={key}><dt className="text-xs uppercase tracking-wide text-muted-foreground">{key.replaceAll("_", " ")}</dt><dd className="mt-1 text-sm">{display(value)}</dd></div>)}</dl></section><section><h3 className="mb-2 text-sm font-semibold">Residents</h3><div className="space-y-3">{detail.residents.map((resident) => <article className="rounded border p-3" key={resident.resident_id}><div className="mb-2 flex flex-wrap justify-between gap-2"><strong>{residentLabel(resident)}</strong><span className="text-xs text-muted-foreground">{resident.resident_code} · {display(resident.relationship_to_head)} · {resident.is_minor ? "Minor" : "Adult"}</span></div><dl className="grid gap-2 sm:grid-cols-2">{Object.entries(resident.profile).filter(([key]) => !["birth_date", "guardian_name"].includes(key)).map(([key, value]) => <div key={key}><dt className="text-xs text-muted-foreground">{key.replaceAll("_", " ")}</dt><dd className="text-sm">{display(value)}</dd></div>)}</dl></article>)}</div></section><section><h3 className="mb-2 text-sm font-semibold">Consent and source</h3><p className="text-sm text-muted-foreground">{detail.consents?.length ?? 0} consent record(s) are attached to this version. The package was collected through the approved profiling workflow for {detail.sitio_name}.</p></section>{canReview && <section className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Officer review</h3><Input aria-label="Return reason" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="Reason required when returning" /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDetail(null)}>Close</Button><Button variant="outline" onClick={() => void decide("return")}>Return with reason</Button><Button onClick={() => void decide("approve")}>Approve package</Button></div></section>}{!canReview && <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>}</CardContent></Card>}

    <Card><CardContent className="p-0"><button type="button" className="flex w-full items-center justify-between px-4 py-4 text-left font-medium" onClick={() => setShowAdvanced((value) => !value)} aria-expanded={showAdvanced}><span>Advanced collection and administration tools</span>{showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{showAdvanced && <div className="border-t p-4"><p className="mb-4 text-sm text-muted-foreground">Existing cycles, consent, imports, corrections, duplicate resolution, and audit-safe workflow tools remain available here. These tools are intentionally kept out of the overview.</p><ProfilingWorkspace audience={audience} role={role} permissions={permissions} /></div>}</CardContent></Card>
  </div>;
}
