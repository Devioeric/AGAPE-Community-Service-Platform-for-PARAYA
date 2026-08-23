"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  History, Loader2, Plus, Calendar, Download, Clock, Bot, User,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { exportToExcel } from "@/lib/export";

// ─── Types ──────────────────────────────────────────────────────────────────

type PeriodType = "monthly" | "quarterly" | "yearly";

interface SnapshotRow {
  id:           string;
  period_type:  PeriodType;
  period_start: string;
  period_end:   string;
  trigger:      "cron" | "manual";
  created_at:   string;
  data:         {
    period:       { label: string };
    generated_at: string;
    totals: Record<string, number>;
    programsByStatus:  Record<string, number>;
    proposalsByStatus: Record<string, number>;
    sdgCounts:         Record<string, number>;
    needsByCategory:   Record<string, number>;
    donationsByType:   Record<string, number>;
    topBarangays:      { name: string; programCount: number }[];
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function downloadJson(snap: SnapshotRow) {
  const blob = new Blob([JSON.stringify(snap.data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `snapshot-${snap.period_type}-${snap.period_start}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToExcelFlattened(snap: SnapshotRow) {
  // Build a wide "summary" sheet with all totals + breakdowns flattened.
  const rows = [
    { Metric: "Period",             Value: snap.data.period.label   },
    { Metric: "Generated at",       Value: fmtDateTime(snap.data.generated_at) },
    ...Object.entries(snap.data.totals).map(([k, v]) => ({
      Metric: k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
      Value:  v,
    })),
  ];
  exportToExcel(rows, `snapshot-${snap.period_type}-${snap.period_start}`, "Summary");
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<"" | PeriodType>("");

  // Trigger dialog
  const [dlg, setDlg]             = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [scope, setScope]         = useState<"current" | "previous">("current");
  const [running, setRunning]     = useState(false);

  // Detail dialog
  const [viewing, setViewing]     = useState<SnapshotRow | null>(null);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    const url = filter ? `/api/analytics/snapshots?period_type=${filter}` : "/api/analytics/snapshots";
    const res = await fetch(url);
    if (res.ok) {
      const j = await res.json();
      setSnapshots(j.data ?? []);
    } else {
      toast.error("Failed to load snapshots.");
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  async function trigger() {
    setRunning(true);
    const res = await fetch("/api/analytics/snapshots/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ period_type: periodType, scope }),
    });
    if (res.ok) {
      const j = await res.json();
      toast.success(`Snapshot generated for ${j.period.label}.`);
      setDlg(false);
      fetchSnapshots();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to generate snapshot.");
    }
    setRunning(false);
  }

  const counts = useMemo(() => ({
    total:     snapshots.length,
    monthly:   snapshots.filter((s) => s.period_type === "monthly").length,
    quarterly: snapshots.filter((s) => s.period_type === "quarterly").length,
    yearly:    snapshots.filter((s) => s.period_type === "yearly").length,
  }), [snapshots]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Report Snapshots
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Frozen aggregates per month / quarter / year. Generated automatically on the 1st of each period (Vercel Cron), or trigger one manually.
          </p>
        </div>
        <Button onClick={() => setDlg(true)} className="bg-primary hover:bg-primary-dark text-white gap-1.5">
          <Plus className="w-4 h-4" /> Generate Snapshot
        </Button>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Total Snapshots", count: counts.total,     style: "bg-surface border border-border text-foreground" },
          { label: "Monthly",         count: counts.monthly,   style: "bg-primary/10 text-primary border border-primary/20" },
          { label: "Quarterly",       count: counts.quarterly, style: "bg-accent/15 text-primary-dark border border-accent/30" },
          { label: "Yearly",          count: counts.yearly,    style: "bg-success/10 text-success border border-success/20" },
        ].map((s) => (
          <div key={s.label} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shadow-card ${s.style}`}>
            <span className="font-bold text-lg font-heading">{loading ? "—" : s.count}</span>
            <span className="opacity-80">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Filter by period:</Label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="h-9 px-3 text-sm"
        >
          <option value="">All periods</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>

      {/* Table */}
      <Card className="border-border shadow-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading snapshots…
            </div>
          ) : snapshots.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <History className="w-10 h-10 mx-auto opacity-30" />
              <p className="text-sm">No snapshots yet.</p>
              <p className="text-xs">Either wait for the cron schedule or click <strong>Generate Snapshot</strong> above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border bg-surface-alt/50">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Period</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Type</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Coverage</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium hidden sm:table-cell">Programs</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium hidden sm:table-cell">Hours</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden lg:table-cell">Generated</th>
                    <th className="py-3 px-4 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s, i) => (
                    <tr key={s.id} className={`border-b border-border/60 ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                      <td className="py-3 px-4 font-medium text-foreground">{s.data.period.label}</td>
                      <td className="py-3 px-4">
                        <Badge className="bg-muted text-muted-foreground border border-border capitalize text-[10px]">
                          {s.period_type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs hidden md:table-cell whitespace-nowrap">
                        {fmtDate(s.period_start)} – {fmtDate(s.period_end)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums hidden sm:table-cell">{s.data.totals.programs}</td>
                      <td className="py-3 px-4 text-right tabular-nums hidden sm:table-cell">{s.data.totals.volunteerHours}</td>
                      <td className="py-3 px-4 text-xs hidden lg:table-cell">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          {s.trigger === "cron" ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          {fmtDateTime(s.created_at)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewing(s)}
                            className="text-xs px-2 py-1 rounded-md hover:bg-surface-alt text-muted-foreground hover:text-foreground transition-colors"
                          >
                            View
                          </button>
                          <button
                            onClick={() => exportToExcelFlattened(s)}
                            className="w-7 h-7 rounded-md hover:bg-success/10 flex items-center justify-center text-muted-foreground hover:text-success transition-colors"
                            title="Download as Excel"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => downloadJson(s)}
                            className="w-7 h-7 rounded-md hover:bg-surface-alt flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                            title="Download JSON"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Generate dialog ─────────────────────────────────────────────── */}
      <Dialog open={dlg} onOpenChange={(o) => { if (!o) setDlg(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> Generate Snapshot
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Period type</Label>
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as PeriodType)}
                className="w-full h-9 px-3 text-sm"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Coverage</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope("current")}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all text-left ${
                    scope === "current"
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-alt"
                  }`}
                >
                  <p className="font-medium">Current period</p>
                  <p className="text-xs opacity-80 mt-0.5">In-progress (this month/quarter/year)</p>
                </button>
                <button
                  type="button"
                  onClick={() => setScope("previous")}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all text-left ${
                    scope === "previous"
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-alt"
                  }`}
                >
                  <p className="font-medium">Previous period</p>
                  <p className="text-xs opacity-80 mt-0.5">Most recently completed</p>
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground p-2 rounded-lg bg-info/5 border border-info/20 flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 text-info flex-shrink-0 mt-0.5" />
              Existing snapshots for this period will be overwritten with the latest data.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>Cancel</Button>
            <Button onClick={trigger} disabled={running} className="bg-primary hover:bg-primary-dark text-white">
              {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              {viewing?.data.period.label}
            </DialogTitle>
            {viewing && (
              <p className="text-xs text-muted-foreground">
                {fmtDate(viewing.period_start)} – {fmtDate(viewing.period_end)} · Generated {fmtDateTime(viewing.data.generated_at)}
              </p>
            )}
          </DialogHeader>
          {viewing && (
            <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
              {/* Totals grid */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Totals</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(viewing.data.totals).map(([k, v]) => (
                    <div key={k} className="p-2.5 rounded-lg border border-border/60 bg-surface-alt/30">
                      <p className="text-[10px] text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</p>
                      <p className="text-lg font-bold font-heading text-foreground tabular-nums">{v.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Programs by status */}
              {Object.keys(viewing.data.programsByStatus).length > 0 && (
                <BreakdownSection title="Programs by Status" data={viewing.data.programsByStatus} />
              )}
              {Object.keys(viewing.data.proposalsByStatus).length > 0 && (
                <BreakdownSection title="Proposals by Status" data={viewing.data.proposalsByStatus} />
              )}
              {Object.keys(viewing.data.needsByCategory).length > 0 && (
                <BreakdownSection title="Community Needs by Category" data={viewing.data.needsByCategory} />
              )}
              {Object.values(viewing.data.sdgCounts).some((v) => v > 0) && (
                <BreakdownSection title="SDG Alignment" data={viewing.data.sdgCounts as Record<string, number>} prefix="SDG " />
              )}
              {viewing.data.topBarangays.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top Barangays by Programs</p>
                  <ul className="space-y-1">
                    {viewing.data.topBarangays.map((b) => (
                      <li key={b.name} className="flex items-center justify-between p-2 rounded-lg border border-border/60 bg-surface-alt/30 text-sm">
                        <span className="text-foreground">{b.name}</span>
                        <span className="font-semibold tabular-nums">{b.programCount}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {viewing && (
              <>
                <Button variant="outline" onClick={() => exportToExcelFlattened(viewing)} className="gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" /> Excel
                </Button>
                <Button variant="outline" onClick={() => downloadJson(viewing)} className="gap-1.5">
                  <Download className="w-4 h-4" /> JSON
                </Button>
                <Button onClick={() => setViewing(null)}>Close</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helper component ──────────────────────────────────────────────────────

function BreakdownSection({
  title, data, prefix = "",
}: { title: string; data: Record<string, number>; prefix?: string }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      <ul className="space-y-1">
        {entries.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between p-2 rounded-lg border border-border/60 bg-surface-alt/30 text-sm">
            <span className="text-foreground capitalize">{prefix}{k.replace(/_/g, " ")}</span>
            <span className="font-semibold tabular-nums">{v.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
