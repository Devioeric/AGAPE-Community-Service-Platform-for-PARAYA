"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Sparkles, FileText, CheckCircle2, Clock, Archive, AlertCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExportMenu } from "@/components/shared/ExportMenu";
import { Printer } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { hasCapability } from "@/lib/auth/capabilities";
import { StructuredReportDocument } from "@/components/reporting/StructuredReportDocument";
import { exportStructuredReport } from "@/components/reporting/report-export";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AIReport {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  narrative: string;
  report_document: unknown;
  generation_mode: "ai" | "template" | null;
  status: "draft" | "reviewed" | "approved";
  row_version: number;
  created_at: string;
  archived_at: string | null;
  users: { full_name: string } | null;
}

interface ReportHistory {
  report?: unknown;
  versions: { version: number; reason: string; snapshot: { narrative: string } }[];
  events: { version: number; event: string; reason: string | null }[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-warning/10 text-warning border border-warning/20",
  reviewed: "bg-info/10 text-info border border-info/20",
  approved: "bg-success/10 text-success border border-success/20",
};

const STATUS_NEXT: Record<string, { label: string; value: string }> = {
  draft:    { label: "Mark as Reviewed", value: "reviewed" },
  reviewed: { label: "Approve Report",   value: "approved" },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const today = () => new Date().toISOString().split("T")[0];
const monthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split("T")[0];
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OfficerReportsPage() {
  const actor = useDashboardActor();
  const canManage = hasCapability(actor.role, actor.permissions, "report.manage");
  const [reports, setReports]     = useState<AIReport[]>([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [periodStart, setPeriodStart] = useState(monthAgo);
  const [periodEnd, setPeriodEnd]     = useState(today);

  // View dialog
  const [viewReport, setViewReport] = useState<AIReport | null>(null);
  const [updating, setUpdating]     = useState(false);
  const [changeTarget, setChangeTarget] = useState<{ report: AIReport; action: "correct" | "return" | "archive" } | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [correctionText, setCorrectionText] = useState("");
  const [changeError, setChangeError] = useState<string | null>(null);
  const [history, setHistory] = useState<ReportHistory | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationController, setGenerationController] = useState<AbortController | null>(null);

  // Knowledge-base filters: full-text search across title + narrative,
  // plus status and year scopes for quickly drilling into past cycles.
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<"" | "draft" | "reviewed" | "approved">("");
  const [yearFilter, setYearFilter]       = useState<string>("");

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/ai/reports?include_archived=${includeArchived}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Reports unavailable");
      const j = await res.json(); setReports(j.data ?? []);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [includeArchived]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  useEffect(() => {
    setHistory(null); setHistoryError(false);
    if (!viewReport) return;
    const controller = new AbortController();
    fetch(`/api/ai/reports/${viewReport.id}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("History unavailable"); const body = await response.json(); setHistory(body.data); })
      .catch(() => { if (!controller.signal.aborted) setHistoryError(true); });
    return () => controller.abort();
  }, [viewReport]);

  // ── Generate ──────────────────────────────────────────────────────────────────

  async function generateReport() {
    if (!periodStart || !periodEnd) { toast.error("Please select a date range."); return; }
    if (periodStart > periodEnd)    { toast.error("Start date must be before end date."); return; }
    if ((Date.parse(periodEnd) - Date.parse(periodStart)) / 86400000 > 730) { toast.error("Choose a period of no more than 730 days."); return; }

    setGenerating(true);
    setGenerationError(null);
    const controller = new AbortController();
    setGenerationController(controller);
    toast.info("Generating report with AI… this may take a few seconds.");
    try {
      const res = await fetch("/api/ai/narrative-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }), signal: controller.signal });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "The report could not be generated.");
      toast.success("Report generated successfully.");
      await fetchReports();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") { toast.info("Report generation cancelled."); }
      else { const message = error instanceof Error ? error.message : "The report could not be generated."; setGenerationError(message); toast.error(message); }
    } finally { setGenerating(false); setGenerationController(null); }
  }

  // ── Update status ─────────────────────────────────────────────────────────────

  async function updateStatus(id: string, status: string) {
    const report = reports.find((item) => item.id === id);
    if (!report) return;
    const action = status === "reviewed" ? "review" : "approve";
    await performReportChange(report, action);
  }

  async function performReportChange(report: AIReport, action: "correct" | "return" | "archive" | "review" | "approve", extra: { reason?: string; narrative?: string; report_document?: unknown } = {}) {
    setUpdating(true); setChangeError(null);
    try {
    const res = await fetch(`/api/ai/reports/${report.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ expected_version: report.row_version, action, ...extra }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error ?? "The report change was not saved.");
    const updated: AIReport = { ...report, status: payload.data.status, row_version: payload.data.rowVersion,
      narrative: payload.data.narrative ?? report.narrative, archived_at: payload.data.archivedAt ?? report.archived_at };
    toast.success(action === "correct" ? "Draft corrected; prior content is retained." : action === "return" ? "Report returned to editable draft." : "Report updated.");
    setChangeTarget(null);
    setViewReport(action === "archive" ? null : updated);
    await fetchReports();
    return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The report change was not saved.";
      setChangeError(message); toast.error(message); return false;
    } finally { setUpdating(false); }
  }

  function openReportChange(report: AIReport, action: "correct" | "return" | "archive") {
    setChangeReason(""); setCorrectionText(report.narrative); setChangeError(null);
    setViewReport(null); setChangeTarget({ report, action });
  }

  // ── Filtering / counts ───────────────────────────────────────────────────────
  // Filtered list is computed client-side. Reports rarely exceed a few hundred
  // in practice, and full-text matching across the narrative is the whole point
  // of the knowledge base — sending a SQL-side search for that would just add
  // round-trips without changing the UX.

  const years = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => set.add(String(new Date(r.period_start).getFullYear())));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [reports]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (yearFilter && String(new Date(r.period_start).getFullYear()) !== yearFilter) return false;
      if (q) {
        const matches =
          r.title.toLowerCase().includes(q) ||
          r.narrative.toLowerCase().includes(q) ||
          (r.users?.full_name?.toLowerCase().includes(q) ?? false);
        if (!matches) return false;
      }
      return true;
    });
  }, [reports, search, statusFilter, yearFilter]);

  const counts = useMemo(() => ({
    total:    reports.length,
    draft:    reports.filter((r) => r.status === "draft").length,
    reviewed: reports.filter((r) => r.status === "reviewed").length,
    approved: reports.filter((r) => r.status === "approved").length,
  }), [reports]);

  const hasFilters = !!(search || statusFilter || yearFilter);
  const clearFilters = () => { setSearch(""); setStatusFilter(""); setYearFilter(""); };

  // Highlight matched substring within a snippet from the narrative — gives the
  // researcher a glimpse of *why* a report matched the query.
  function snippetFor(r: AIReport): { before: string; match: string; after: string } | null {
    const q = search.trim();
    if (!q) return null;
    const idx = r.narrative.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return null;
    const start = Math.max(0, idx - 40);
    const end   = Math.min(r.narrative.length, idx + q.length + 80);
    return {
      before: (start > 0 ? "…" : "") + r.narrative.slice(start, idx),
      match:  r.narrative.slice(idx, idx + q.length),
      after:  r.narrative.slice(idx + q.length, end) + (end < r.narrative.length ? "…" : ""),
    };
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Generate section */}
      {canManage && <Card className="border-border shadow-card border-l-4 border-l-primary">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Generate Structured Period Report
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            The report combines aggregate programs, needs, profiling, volunteer, partnership, finance, SDG, impact, and data-quality evidence into a formal PARAYA/DYCI document. AI prose is advisory and always requires human review.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1.5 flex-1">
              <label className="text-sm font-medium text-foreground">Period Start</label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="focus-visible:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <label className="text-sm font-medium text-foreground">Period End</label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="focus-visible:ring-primary/30"
              />
            </div>
            <Button
              onClick={generateReport}
              disabled={generating}
              className="bg-primary hover:bg-primary-light text-white sm:self-end"
            >
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
                : <><Sparkles className="w-4 h-4 mr-2" /> Generate Report</>}
            </Button>
            {generating && <Button type="button" variant="outline" onClick={() => generationController?.abort()}>Cancel</Button>}
          </div>
          {generationError && <div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{generationError} <Button variant="outline" size="sm" className="ml-2" onClick={generateReport}>Retry</Button></div>}

          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-warning/5 border border-warning/20">
            <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-warning">
              AI-generated reports are for decision support only. Officers must review and approve before official use. The narrative is based on data currently in the system for the selected period.
            </p>
          </div>
        </CardContent>
      </Card>}

      {/* Report knowledge base — past reports as searchable institutional memory */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Reports Knowledge Base
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {filtered.length}{filtered.length !== counts.total ? ` of ${counts.total}` : ""} report{counts.total !== 1 ? "s" : ""}
              </span>
              {counts.draft > 0    && <Badge className="bg-warning/10 text-warning border-warning/20 border">{counts.draft} draft</Badge>}
              {counts.reviewed > 0 && <Badge className="bg-info/10 text-info border-info/20 border">{counts.reviewed} reviewed</Badge>}
              {counts.approved > 0 && <Badge className="bg-success/10 text-success border-success/20 border">{counts.approved} approved</Badge>}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} /> Include archived
              </label>
              {/* Export tabular summary of the (filtered) report list */}
              <ExportMenu
                rows={filtered.map((r) => ({
                  Title:        r.title,
                  Status:       r.status,
                  "Period Start": r.period_start,
                  "Period End":   r.period_end,
                  Generated:    r.created_at,
                  "Generated By": r.users?.full_name ?? "",
                  Narrative:    r.narrative,
                }))}
                filename="paraya-reports"
                sheetName="Reports"
              />
            </div>
          </div>

          {/* Filter bar — search across title + narrative, status + year filters */}
          {reports.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, narrative, author…"
                  className="h-9 pl-8 text-sm focus-visible:ring-primary/30"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="h-9 px-3 text-sm rounded-xl border border-border bg-card text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="reviewed">Reviewed</option>
                <option value="approved">Approved</option>
              </select>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="h-9 px-3 text-sm rounded-xl border border-border bg-card text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All years</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground gap-1">
                  <X className="w-3.5 h-3.5" /> Clear
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loadError ? <div role="alert" className="p-6 text-sm text-warning">Reports could not be loaded. <Button variant="outline" size="sm" onClick={fetchReports}>Retry</Button></div> : loading ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
            </div>
          ) : reports.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No reports generated yet. Create your first AI report above.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No reports match your filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-4 px-6 py-4 hover:bg-surface-alt/30 transition-colors cursor-pointer"
                  onClick={() => setViewReport(r)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium text-foreground text-sm">{r.title}</p>
                      <Badge className={`${STATUS_BADGE[r.status] ?? ""} capitalize text-xs`}>
                        {r.status}
                      </Badge>
                      {r.archived_at && <Badge variant="outline">Archived</Badge>}
                      {r.generation_mode && <Badge variant="outline" className="capitalize">{r.generation_mode}-generated</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Generated {fmtDate(r.created_at)}
                      {r.users && ` by ${r.users.full_name}`}
                    </p>
                    {(() => {
                      const snip = snippetFor(r);
                      if (!snip) {
                        return <p className="text-xs text-foreground/60 mt-1.5 line-clamp-2">{r.narrative}</p>;
                      }
                      return (
                        <p className="text-xs text-foreground/60 mt-1.5 line-clamp-2">
                          {snip.before}
                          <mark className="bg-warning/20 text-foreground rounded px-0.5">{snip.match}</mark>
                          {snip.after}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {canManage && !r.archived_at && STATUS_NEXT[r.status] && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); updateStatus(r.id, STATUS_NEXT[r.status].value); }}
                        disabled={updating}
                      >
                        {r.status === "reviewed"
                          ? <CheckCircle2 className="w-3 h-3 mr-1 text-success" />
                          : <Clock className="w-3 h-3 mr-1" />}
                        {STATUS_NEXT[r.status].label}
                      </Button>
                    )}
                    {canManage && !r.archived_at && <button
                      onClick={(e) => { e.stopPropagation(); openReportChange(r, "archive"); }}
                      className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors"
                      aria-label={`Archive report ${r.title}`}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Report Dialog */}
      <Dialog open={!!viewReport} onOpenChange={(open) => { if (!open) setViewReport(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-heading pr-6">{viewReport?.title}</DialogTitle>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {viewReport && (
                <Badge className={`${STATUS_BADGE[viewReport.status] ?? ""} capitalize text-xs`}>
                  {viewReport.status}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {viewReport && `${fmtDate(viewReport.period_start)} – ${fmtDate(viewReport.period_end)}`}
              </span>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="py-2">{viewReport && <StructuredReportDocument value={viewReport.report_document} status={viewReport.status} legacyNarrative={viewReport.narrative} />}</div>
            <details className="border-t border-border py-3 text-sm">
              <summary className="cursor-pointer font-medium">Retained corrections and lifecycle history</summary>
              {historyError ? <p role="alert" className="text-sm text-warning">History could not be loaded. Close and reopen the report to retry.</p> : !history ? <p>Loading history…</p> : <div className="space-y-3 pt-3">
                {history.events.map(event => <p key={`${event.version}-${event.event}`} className="text-xs text-muted-foreground">Version {event.version}: {event.event}{event.reason ? ` — ${event.reason}` : ""}</p>)}
                {history.versions.map(version => <details key={version.version} className="rounded border border-border p-3">
                  <summary className="cursor-pointer">Content version {version.version} — {version.reason}</summary>
                  <p className="whitespace-pre-wrap pt-2 text-sm">{version.snapshot.narrative}</p>
                </details>)}
              </div>}
            </details>
          </div>

          <DialogFooter className="shrink-0 flex-wrap gap-2 sm:justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5" />
              AI-generated — review before official use
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setViewReport(null)}>Close</Button>
              {viewReport && (
                <Button
                  variant="outline"
                  className="border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => window.open(`/officer/reports/${viewReport.id}/print`, "_blank")}
                >
                  <Printer className="w-4 h-4 mr-1" /> Print / PDF
                </Button>
              )}
              {Boolean(viewReport?.report_document) && viewReport && <Button variant="outline" onClick={() => { if (!exportStructuredReport(viewReport.report_document, `paraya-report-${viewReport.id}`)) toast.error("This legacy report has no structured workbook."); }}><FileText className="w-4 h-4 mr-1" /> Export workbook</Button>}
              {canManage && viewReport && !viewReport.archived_at && viewReport.status === "draft" && <Button variant="outline" disabled={updating} onClick={() => openReportChange(viewReport, "correct")}>Correct draft</Button>}
              {canManage && viewReport && !viewReport.archived_at && viewReport.status === "reviewed" && <Button variant="outline" disabled={updating} onClick={() => openReportChange(viewReport, "return")}>Return for correction</Button>}
              {canManage && viewReport && !viewReport.archived_at && STATUS_NEXT[viewReport.status] && (
                <Button
                  disabled={updating}
                  onClick={() => updateStatus(viewReport.id, STATUS_NEXT[viewReport.status].value)}
                  className={viewReport.status === "reviewed"
                    ? "bg-success hover:bg-success/90 text-white"
                    : "bg-primary hover:bg-primary-light text-white"}
                >
                  {updating
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : STATUS_NEXT[viewReport.status].label}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Human corrections and lifecycle reasons are never sent to an AI provider. */}
      <Dialog open={!!changeTarget} onOpenChange={(open) => { if (!open && !updating) setChangeTarget(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{changeTarget?.action === "correct" ? "Correct report draft" : changeTarget?.action === "return" ? "Return report for correction" : "Archive report"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{changeTarget?.report.title} · Version {changeTarget?.report.row_version}. {changeTarget?.action === "correct" ? "Prior content and authorship are retained. Use aggregate information only; do not include resident-identifiable data." : changeTarget?.action === "return" ? "This returns the reviewed report to an editable draft. Explain the correction needed." : "This removes the report from the active workspace and retains its content and history."}</p>
          {changeTarget?.action === "correct" && <div className="space-y-2">
            <Label htmlFor="report-correction-text">Corrected narrative</Label>
            <Textarea id="report-correction-text" value={correctionText} onChange={event => setCorrectionText(event.target.value)} rows={14} minLength={20} maxLength={50000} disabled={updating} />
          </div>}
          <div className="space-y-2">
            <Label htmlFor="report-change-reason">Reason</Label>
            <Textarea id="report-change-reason" value={changeReason} onChange={event => setChangeReason(event.target.value)} minLength={5} maxLength={changeTarget?.action === "archive" ? 1000 : 2000} disabled={updating} />
          </div>
          {changeError && <p role="alert" className="text-sm text-warning">{changeError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={updating} onClick={() => setChangeTarget(null)}>Cancel</Button>
            <Button disabled={updating || changeReason.trim().length < 5 || (changeTarget?.action === "correct" && (correctionText.trim().length < 20 || correctionText.trim() === changeTarget.report.narrative))}
              onClick={() => changeTarget && performReportChange(changeTarget.report, changeTarget.action, { reason: changeReason.trim(), ...(changeTarget.action === "correct" ? { narrative: correctionText.trim(), report_document: changeTarget.report.report_document } : {}) })} className="bg-paraya-brown text-white">
              {updating ? "Saving…" : changeTarget?.action === "correct" ? "Save correction" : changeTarget?.action === "return" ? "Return to draft" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
