"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2, Plus, Users, BookOpen, Calendar,
  CheckCircle2, AlertCircle, Quote,
} from "lucide-react";
import { toast } from "sonner";
import { ImpactAggregateSummary } from "@/components/reporting/ImpactAggregateSummary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Program { id: string; title: string; }

interface Indicator {
  id: string;
  program_id: string;
  indicator_type: string;
  value: number;
  unit: string;
  recorded_date: string;
  notes: string | null;
  programs: { title: string } | null;
}

interface Qualitative {
  id: string;
  program_id: string;
  type: string;
  content: string;
  subject_name: string | null;
  recorded_date: string;
  programs: { title: string } | null;
}

interface FollowUp {
  id: string;
  program_id: string;
  // DB column is `followup_type` (no underscore between follow and up).
  followup_type: string;
  status: string;
  notes: string | null;
  scheduled_date: string;
  completed_date: string | null;
  programs: { title: string } | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const INDICATOR_TYPES = [
  { value: "beneficiaries_reached",  label: "Beneficiaries Reached",  unit: "persons" },
  { value: "families_served",        label: "Families Served",        unit: "families" },
  { value: "trainings_conducted",    label: "Trainings Conducted",    unit: "sessions" },
  { value: "materials_distributed",  label: "Materials Distributed",  unit: "pcs" },
  { value: "volunteer_hours",        label: "Volunteer Hours",        unit: "hours" },
  { value: "custom",                 label: "Other / Custom",         unit: "" },
];

const QUAL_TYPES = ["testimonial", "case_study", "pre_post_narrative", "observation"];

const FOLLOWUP_STATUS_BADGE: Record<string, string> = {
  scheduled:  "bg-info/10 text-info border border-info/20",
  in_progress:"bg-warning/10 text-warning border border-warning/20",
  completed:  "bg-success/10 text-success border border-success/20",
  overdue:    "bg-danger/10 text-danger border border-danger/20",
};

type Tab = "metrics" | "qualitative" | "followups";

// ─── Schemas ───────────────────────────────────────────────────────────────────

const indicatorSchema = z.object({
  program_id:     z.string().min(1, "Program required"),
  indicator_type: z.string().min(1, "Type required"),
  value:          z.string().min(1, "Value required"),
  unit:           z.string().min(1, "Unit required"),
  recorded_date:  z.string().min(1, "Date required"),
  notes:          z.string().optional(),
});
type IndicatorForm = z.infer<typeof indicatorSchema>;

const qualSchema = z.object({
  program_id:    z.string().min(1, "Program required"),
  type:          z.string().min(1, "Type required"),
  content:       z.string().min(10, "Please provide more detail"),
  subject_name:  z.string().optional(),
  subject_consent_confirmed: z.boolean(),
  recorded_date: z.string().min(1, "Date required"),
});
type QualForm = z.infer<typeof qualSchema>;

const followupSchema = z.object({
  program_id:     z.string().min(1, "Program required"),
  followup_type:  z.string().min(1, "Type required"),
  scheduled_date: z.string().min(1, "Date required"),
  notes:          z.string().optional(),
});
type FollowUpForm = z.infer<typeof followupSchema>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const today = () => new Date().toISOString().split("T")[0];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OfficerImpactPage() {
  const [tab, setTab]               = useState<Tab>("metrics");
  const [programs, setPrograms]     = useState<Program[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [qualitative, setQual]      = useState<Qualitative[]>([]);
  const [followups, setFollowups]   = useState<FollowUp[]>([]);
  const [loading, setLoading]       = useState(true);

  // Dialogs
  const [indFormOpen, setIndFormOpen]   = useState(false);
  const [qualFormOpen, setQualFormOpen] = useState(false);
  const [fuFormOpen, setFuFormOpen]     = useState(false);
  const [saving, setSaving]             = useState(false);

  // Follow-up status update
  const [updatingFu, setUpdatingFu] = useState<string | null>(null);

  const indForm = useForm<IndicatorForm>({ resolver: zodResolver(indicatorSchema), defaultValues: { recorded_date: today(), unit: "persons" } });
  const qualForm = useForm<QualForm>({ resolver: zodResolver(qualSchema), defaultValues: { type: "testimonial", recorded_date: today(), subject_consent_confirmed: false } });
  const fuForm  = useForm<FollowUpForm>({ resolver: zodResolver(followupSchema), defaultValues: { followup_type: "6_month" } });

  // Auto-fill unit when indicator type changes
  const watchedType = indForm.watch("indicator_type");
  useEffect(() => {
    const meta = INDICATOR_TYPES.find((t) => t.value === watchedType);
    if (meta?.unit) indForm.setValue("unit", meta.unit);
  }, [watchedType, indForm]);

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [progRes, indRes, qualRes, fuRes] = await Promise.all([
      fetch("/api/programs"),
      fetch("/api/impact"),
      fetch("/api/impact/qualitative"),
      fetch("/api/impact/followup"),
    ]);
    if (progRes.ok) { const j = await progRes.json(); setPrograms(j.data ?? []); }
    if (indRes.ok)  { const j = await indRes.json();  setIndicators(j.data ?? []); }
    if (qualRes.ok) { const j = await qualRes.json(); setQual(j.data ?? []); }
    if (fuRes.ok)   { const j = await fuRes.json();   setFollowups(j.data ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Derived stats ─────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const beneficiaries = indicators
      .filter((i) => i.indicator_type === "beneficiaries_reached")
      .reduce((s, i) => s + (i.value ?? 0), 0);
    const trainings = indicators
      .filter((i) => i.indicator_type === "trainings_conducted")
      .reduce((s, i) => s + (i.value ?? 0), 0);
    const overdue = followups.filter((f) => {
      if (f.status === "completed") return false;
      return new Date(f.scheduled_date) < new Date();
    }).length;
    return { beneficiaries, trainings, qualCount: qualitative.length, overdue };
  }, [indicators, qualitative, followups]);

  // ── Submit handlers ───────────────────────────────────────────────────────────

  async function onIndicatorSubmit(values: IndicatorForm) {
    setSaving(true);
    const res = await fetch("/api/impact", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, value: parseFloat(values.value) }),
    });
    if (res.ok) {
      toast.success("Impact metric recorded.");
      setIndFormOpen(false);
      indForm.reset({ recorded_date: today(), unit: "persons" });
      fetchAll();
    } else { toast.error("Failed to save metric."); }
    setSaving(false);
  }

  async function onQualSubmit(values: QualForm) {
    setSaving(true);
    const res = await fetch("/api/impact/qualitative", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, subject_name: values.subject_name || null }),
    });
    if (res.ok) {
      toast.success("Record added.");
      setQualFormOpen(false);
      qualForm.reset({ type: "testimonial", recorded_date: today(), subject_consent_confirmed: false });
      fetchAll();
    } else { toast.error("Failed to save record."); }
    setSaving(false);
  }

  async function onFollowUpSubmit(values: FollowUpForm) {
    setSaving(true);
    const res = await fetch("/api/impact/followup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, notes: values.notes || null }),
    });
    if (res.ok) {
      toast.success("Follow-up scheduled.");
      setFuFormOpen(false);
      fuForm.reset({ followup_type: "6_month" });
      fetchAll();
    } else { toast.error("Failed to schedule follow-up."); }
    setSaving(false);
  }

  async function updateFollowUpStatus(id: string, expectedStatus: string, status: string) {
    setUpdatingFu(id);
    const payload: Record<string, string> = { expected_status: expectedStatus, status };
    if (status === "completed") payload.completed_date = today();
    const res = await fetch(`/api/impact/followup/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (res.ok) { toast.success(`Follow-up marked as ${status}.`); fetchAll(); }
    else { toast.error("Update failed."); }
    setUpdatingFu(null);
  }

  async function voidImpact(kind: "indicator" | "qualitative" | "followup", id: string) {
    const reason = window.prompt("Correction reason (required; history will be retained)")?.trim();
    if (!reason || reason.length < 3) return;
    const path = kind === "indicator" ? `/api/impact/${id}/void` : kind === "qualitative" ? `/api/impact/qualitative/${id}/void` : `/api/impact/followup/${id}/void`;
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    if (response.ok) { toast.success("Record voided; correction history retained."); void fetchAll(); }
    else { const payload = await response.json().catch(() => ({})); toast.error(payload.error ?? "Correction failed."); }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <ImpactAggregateSummary />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Beneficiaries Reached", value: stats.beneficiaries.toLocaleString(), icon: Users,         accent: "border-l-primary" },
          { label: "Trainings Conducted",   value: stats.trainings,                      icon: BookOpen,       accent: "border-l-accent" },
          { label: "Qualitative Records",   value: stats.qualCount,                      icon: Quote,          accent: "border-l-success" },
          { label: "Overdue Follow-ups",    value: stats.overdue,                        icon: AlertCircle,    accent: stats.overdue > 0 ? "border-l-danger" : "border-l-muted" },
        ].map(({ label, value, icon: Icon, accent }) => (
          <Card key={label} className={`border-border shadow-card border-l-4 ${accent}`}>
            <CardContent className="px-4 py-2.5">
              <div className="flex items-center gap-2 mb-0.5">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
              <p className="text-2xl font-bold font-heading text-foreground mt-0.5">
                {loading ? "—" : value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-border flex gap-1">
        {([
          { key: "metrics",    label: "Quantitative Metrics" },
          { key: "qualitative",label: "Qualitative Records" },
          { key: "followups",  label: "Follow-up Tracking" },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Quantitative Metrics ─────────────────────────────────────────────────── */}
      {tab === "metrics" && (
        <Card className="border-border shadow-card">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading text-lg">Impact Metrics</CardTitle>
              <Button onClick={() => setIndFormOpen(true)} className="bg-primary hover:bg-primary-light text-white">
                <Plus className="w-4 h-4 mr-1.5" /> Add Metric
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /></div>
            ) : indicators.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">No metrics recorded yet. Add the first impact metric.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border bg-surface-alt/50">
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Metric</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Value</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Program</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden lg:table-cell">Date</th>
                      <th className="py-3 px-4 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {indicators.map((ind, i) => {
                      const meta = INDICATOR_TYPES.find((t) => t.value === ind.indicator_type);
                      return (
                        <tr key={ind.id} className={`border-b border-border/60 ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                          <td className="py-3 px-4">
                            <p className="font-medium text-foreground">{meta?.label ?? ind.indicator_type}</p>
                            {ind.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ind.notes}</p>}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-foreground">{(ind.value ?? 0).toLocaleString()}</span>
                            <span className="text-muted-foreground ml-1 text-xs">{ind.unit}</span>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                            {ind.programs?.title ?? "—"}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs hidden lg:table-cell">
                            {fmtDate(ind.recorded_date)}
                          </td>
                          <td className="py-3 px-4 text-right"><Button size="sm" variant="outline" onClick={() => void voidImpact("indicator", ind.id)}>Void with reason</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Qualitative Records ──────────────────────────────────────────────────── */}
      {tab === "qualitative" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setQualFormOpen(true)} className="bg-primary hover:bg-primary-light text-white">
              <Plus className="w-4 h-4 mr-1.5" /> Add Record
            </Button>
          </div>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : qualitative.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">No qualitative records yet. Add testimonials, case studies, or narratives.</div>
          ) : qualitative.map((q) => (
            <Card key={q.id} className="border-border shadow-card">
              <CardContent className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge className="bg-primary/10 text-primary border border-primary/20 capitalize text-xs">
                        {q.type.replace("_", " ")}
                      </Badge>
                      {q.programs && (
                        <span className="text-xs text-muted-foreground">{q.programs.title}</span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{fmtDate(q.recorded_date)}</span>
                    </div>
                    {q.subject_name && (
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">{q.subject_name}</p>
                    )}
                    <p className="text-sm text-foreground leading-relaxed">{q.content}</p>
                    <Button className="mt-3" size="sm" variant="outline" onClick={() => void voidImpact("qualitative", q.id)}>Void with reason</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Follow-up Tracking ───────────────────────────────────────────────────── */}
      {tab === "followups" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Phase VIII assessment is staged — schedule an Immediate review (within 1 week),
              then 6-month and 12-month follow-ups to track sustained impact.
            </p>
            <Button onClick={() => setFuFormOpen(true)} className="bg-primary hover:bg-primary-light text-white">
              <Plus className="w-4 h-4 mr-1.5" /> Schedule Follow-up
            </Button>
          </div>

          {/* Staged assessment summary — one tile per stage with completion ratio. */}
          {followups.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: "immediate", label: "Immediate", desc: "Within 1 week" },
                { key: "6_month",   label: "6-Month",   desc: "Mid-term sustained outcomes" },
                { key: "12_month",  label: "12-Month",  desc: "Long-term community impact" },
              ] as const).map((stage) => {
                const all  = followups.filter((f) => f.followup_type === stage.key);
                const done = all.filter((f) => f.status === "completed").length;
                const pct  = all.length === 0 ? 0 : Math.round((done / all.length) * 100);
                return (
                  <div key={stage.key} className="p-3 rounded-xl border border-border bg-surface-alt/30">
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm font-medium text-foreground">{stage.label}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{done}/{all.length}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{stage.desc}</p>
                    <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {loading ? (
            <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : followups.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">No follow-ups scheduled yet.</div>
          ) : followups.map((fu) => {
            const isOverdue = fu.status !== "completed" && new Date(fu.scheduled_date) < new Date();
            const effectiveStatus = isOverdue ? "overdue" : fu.status;
            return (
              <div key={fu.id} className="flex items-start gap-4 p-4 rounded-xl border border-border bg-surface-alt/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-medium text-sm text-foreground">
                      {fu.followup_type === "immediate" ? "Immediate"
                        : fu.followup_type === "6_month" ? "6-Month"
                        : "12-Month"} Follow-up
                    </p>
                    <Badge className={`${FOLLOWUP_STATUS_BADGE[effectiveStatus] ?? ""} capitalize text-xs`}>
                      {effectiveStatus.replace("_", " ")}
                    </Badge>
                  </div>
                  {fu.programs && <p className="text-xs text-muted-foreground">{fu.programs.title}</p>}
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    Scheduled: {fmtDate(fu.scheduled_date)}
                    {fu.completed_date && <span className="ml-2">· Completed: {fmtDate(fu.completed_date)}</span>}
                  </div>
                  {fu.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{fu.notes}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {fu.status !== "completed" && (
                    <button
                      disabled={updatingFu === fu.id}
                      onClick={() => updateFollowUpStatus(fu.id, fu.status, fu.status === "scheduled" ? "in_progress" : "completed")}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-success/30 bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-50"
                    >
                      {updatingFu === fu.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <CheckCircle2 className="w-3 h-3" />}
                      {fu.status === "scheduled" ? "Start" : "Complete"}
                    </button>
                  )}
                  {fu.status === "completed" && (
                    <div className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Done
                    </div>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void voidImpact("followup", fu.id)}>Void</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Metric Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={indFormOpen} onOpenChange={setIndFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Add Impact Metric</DialogTitle></DialogHeader>
          <form onSubmit={indForm.handleSubmit(onIndicatorSubmit)} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Program <span className="text-danger">*</span></label>
              <select {...indForm.register("program_id")} className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">— Select program —</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {indForm.formState.errors.program_id && <p className="text-xs text-danger">{indForm.formState.errors.program_id.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Metric Type <span className="text-danger">*</span></label>
              <select {...indForm.register("indicator_type")} className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">— Select type —</option>
                {INDICATOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {indForm.formState.errors.indicator_type && <p className="text-xs text-danger">{indForm.formState.errors.indicator_type.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Value <span className="text-danger">*</span></label>
                <Input type="number" min={0} step="0.1" {...indForm.register("value")} className="focus-visible:ring-primary/30" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Unit</label>
                <Input {...indForm.register("unit")} placeholder="persons, hours…" className="focus-visible:ring-primary/30" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date Recorded <span className="text-danger">*</span></label>
              <Input type="date" {...indForm.register("recorded_date")} className="focus-visible:ring-primary/30" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Input {...indForm.register("notes")} placeholder="Optional context" className="focus-visible:ring-primary/30" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIndFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-light text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Metric"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Qualitative Dialog ───────────────────────────────────────────────── */}
      <Dialog open={qualFormOpen} onOpenChange={setQualFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">Add Qualitative Record</DialogTitle></DialogHeader>
          <form onSubmit={qualForm.handleSubmit(onQualSubmit)} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Program <span className="text-danger">*</span></label>
                <select {...qualForm.register("program_id")} className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">— Select —</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                {qualForm.formState.errors.program_id && <p className="text-xs text-danger">{qualForm.formState.errors.program_id.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <select {...qualForm.register("type")} className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {QUAL_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.replace("_", " ")}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Subject Name <span className="text-muted-foreground text-xs">(optional)</span></label>
              <Input {...qualForm.register("subject_name")} placeholder="Beneficiary name or anonymous" className="focus-visible:ring-primary/30" />
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input type="checkbox" {...qualForm.register("subject_consent_confirmed")} />
                I confirm that the named subject consented to this record. Leave the name blank when consent is unavailable.
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Content <span className="text-danger">*</span></label>
              <textarea
                {...qualForm.register("content")}
                rows={5}
                placeholder="Write the testimonial, case study, or narrative here…"
                className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              {qualForm.formState.errors.content && <p className="text-xs text-danger">{qualForm.formState.errors.content.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date <span className="text-danger">*</span></label>
              <Input type="date" {...qualForm.register("recorded_date")} className="focus-visible:ring-primary/30" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setQualFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-light text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Record"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Schedule Follow-up Dialog ────────────────────────────────────────────── */}
      <Dialog open={fuFormOpen} onOpenChange={setFuFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Schedule Follow-up</DialogTitle></DialogHeader>
          <form onSubmit={fuForm.handleSubmit(onFollowUpSubmit)} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Program <span className="text-danger">*</span></label>
              <select {...fuForm.register("program_id")} className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">— Select program —</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {fuForm.formState.errors.program_id && <p className="text-xs text-danger">{fuForm.formState.errors.program_id.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Follow-up Type</label>
                <select {...fuForm.register("followup_type")} className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="immediate">Immediate (within 1 week)</option>
                  <option value="6_month">6-Month Review</option>
                  <option value="12_month">12-Month Review</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Scheduled Date <span className="text-danger">*</span></label>
                <Input type="date" {...fuForm.register("scheduled_date")} className="focus-visible:ring-primary/30" />
                {fuForm.formState.errors.scheduled_date && <p className="text-xs text-danger">{fuForm.formState.errors.scheduled_date.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                {...fuForm.register("notes")}
                rows={2}
                placeholder="What should be assessed during this follow-up…"
                className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFuFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-light text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────────────────────────────────── */}
    </div>
  );
}
