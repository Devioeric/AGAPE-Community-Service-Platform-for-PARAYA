"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye, Plus, Pencil, Trash2, Loader2, ArrowRight, Search, X, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ExportMenu } from "@/components/shared/ExportMenu";

// Field observations are the open-ended Phase I notes researchers and officers
// jot down during community immersion — BEFORE any structured needs profile
// is filed. Per the PARAYA framework, observation is intentionally flexible:
// "an open-ended approach enables researchers and community workers to gather
// more authentic insights."

// ─── Types ───────────────────────────────────────────────────────────────────

interface Barangay { id: string; name: string }

interface Observation {
  id:                   string;
  observer_id:          string;
  barangay_id:          string | null;
  sitio:                string | null;
  observation_date:     string;
  observation:          string;
  category:             string | null;
  follow_up_action:     string | null;
  promoted_to_need_id:  string | null;
  created_at:           string;
  barangays:            { name: string } | null;
  users:                { full_name: string | null } | null;
  promoted_to_need:     { id: string; title: string } | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "environmental",  label: "Environmental",  color: "bg-success/10 text-success border-success/20" },
  { value: "health",         label: "Health",         color: "bg-danger/10 text-danger border-danger/20" },
  { value: "economic",       label: "Economic",       color: "bg-accent/15 text-accent-foreground border-accent/30" },
  { value: "social",         label: "Social",         color: "bg-info/10 text-info border-info/20" },
  { value: "infrastructure", label: "Infrastructure", color: "bg-warning/10 text-warning border-warning/20" },
  { value: "education",      label: "Education",      color: "bg-primary/10 text-primary border-primary/20" },
  { value: "safety",         label: "Safety",         color: "bg-danger/10 text-danger border-danger/20" },
  { value: "other",          label: "Other",          color: "bg-muted text-muted-foreground border-border" },
];

const CATEGORY_META = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FieldObservationsPage() {
  const [barangays, setBarangays]       = useState<Barangay[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading]           = useState(true);

  // Filters
  const [search, setSearch]             = useState("");
  const [brgyFilter, setBrgyFilter]     = useState("");
  const [catFilter, setCatFilter]       = useState("");
  const [promotedFilter, setPromotedFilter] = useState<"" | "yes" | "no">("");

  // Dialog
  const [dlg, setDlg] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    barangay_id:      "",
    sitio:            "",
    observation_date: new Date().toISOString().slice(0, 10),
    observation:      "",
    category:         "",
    follow_up_action: "",
  });
  const [saving, setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (brgyFilter)     params.set("barangay_id", brgyFilter);
    if (catFilter)      params.set("category", catFilter);
    if (promotedFilter) params.set("promoted", promotedFilter);

    const [bRes, oRes] = await Promise.all([
      fetch("/api/partnerships"),
      fetch(`/api/field-observations?${params.toString()}`),
    ]);
    if (bRes.ok) setBarangays((await bRes.json()).data ?? []);
    if (oRes.ok) setObservations((await oRes.json()).data ?? []);
    setLoading(false);
  }, [brgyFilter, catFilter, promotedFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Client-side text search (small datasets — round-trip not worth it).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return observations;
    return observations.filter((o) =>
      o.observation.toLowerCase().includes(q) ||
      o.sitio?.toLowerCase().includes(q) ||
      o.barangays?.name.toLowerCase().includes(q) ||
      o.follow_up_action?.toLowerCase().includes(q)
    );
  }, [observations, search]);

  const counts = useMemo(() => ({
    total:    observations.length,
    promoted: observations.filter((o) => o.promoted_to_need_id).length,
    pending:  observations.filter((o) => !o.promoted_to_need_id).length,
  }), [observations]);

  // ── Dialog handlers ──────────────────────────────────────────────────────
  function openAdd() {
    setEditingId(null);
    setForm({
      barangay_id:      brgyFilter || "",
      sitio:            "",
      observation_date: new Date().toISOString().slice(0, 10),
      observation:      "",
      category:         "",
      follow_up_action: "",
    });
    setDlg(true);
  }

  function openEdit(o: Observation) {
    setEditingId(o.id);
    setForm({
      barangay_id:      o.barangay_id ?? "",
      sitio:            o.sitio ?? "",
      observation_date: o.observation_date,
      observation:      o.observation,
      category:         o.category ?? "",
      follow_up_action: o.follow_up_action ?? "",
    });
    setDlg(true);
  }

  async function save() {
    if (form.observation.trim().length < 10) {
      toast.error("Observation must be at least 10 characters.");
      return;
    }
    setSaving(true);
    const url    = editingId ? `/api/field-observations/${editingId}` : "/api/field-observations";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        barangay_id:      form.barangay_id || null,
        sitio:            form.sitio.trim() || null,
        category:         form.category || null,
        follow_up_action: form.follow_up_action.trim() || null,
      }),
    });
    if (res.ok) {
      toast.success(editingId ? "Observation updated." : "Observation recorded.");
      setDlg(false);
      fetchAll();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to save.");
    }
    setSaving(false);
  }

  async function deleteObs(id: string) {
    if (!confirm("Delete this field observation?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/field-observations/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Observation removed.");
      setObservations((prev) => prev.filter((o) => o.id !== id));
    } else {
      toast.error("Delete failed.");
    }
    setDeletingId(null);
  }

  async function promoteToNeed(o: Observation) {
    // Lightweight promotion: opens the community-needs new flow with prefilled
    // text. We don't auto-create a need — the researcher should refine the
    // description first. After saving the need, they can link it back via PATCH.
    const titleSeed = o.observation.slice(0, 80) + (o.observation.length > 80 ? "…" : "");
    const params = new URLSearchParams({
      seed_title:       titleSeed,
      seed_description: o.observation,
      seed_category:    o.category ?? "",
      seed_sitio:       o.sitio ?? "",
      seed_observation_id: o.id,
    });
    if (o.barangay_id) params.set("seed_barangay_id", o.barangay_id);
    window.open(`/officer/community-needs?${params.toString()}`, "_self");
  }

  const hasFilters = !!(search || brgyFilter || catFilter || promotedFilter);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border shadow-card border-l-4 border-l-primary">
          <CardContent className="px-4 py-2.5">
            <p className="text-sm text-muted-foreground">Total Observations</p>
            <p className="text-2xl font-bold font-heading mt-0.5">{loading ? "—" : counts.total}</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-card border-l-4 border-l-warning">
          <CardContent className="px-4 py-2.5">
            <p className="text-sm text-muted-foreground">Awaiting Review</p>
            <p className="text-2xl font-bold font-heading mt-0.5">{loading ? "—" : counts.pending}</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-card border-l-4 border-l-success">
          <CardContent className="px-4 py-2.5">
            <p className="text-sm text-muted-foreground">Promoted to Need</p>
            <p className="text-2xl font-bold font-heading mt-0.5">{loading ? "—" : counts.promoted}</p>
          </CardContent>
        </Card>
      </div>

      {/* Header + filters */}
      <Card className="border-border shadow-card">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              <p className="font-heading text-base font-semibold">Field Observations</p>
              <Badge className="bg-muted text-muted-foreground border text-xs ml-1">Phase I</Badge>
            </div>
            <div className="flex items-center gap-2">
              <ExportMenu
                rows={filtered.map((o) => ({
                  Date:           o.observation_date,
                  Barangay:       o.barangays?.name ?? "",
                  Sitio:          o.sitio ?? "",
                  Category:       o.category ?? "",
                  Observation:    o.observation,
                  "Follow-up Action": o.follow_up_action ?? "",
                  "Promoted to Need": o.promoted_to_need?.title ?? "",
                  Observer:       o.users?.full_name ?? "",
                }))}
                filename="paraya-field-observations"
                sheetName="Observations"
              />
              <Button onClick={openAdd} className="bg-primary hover:bg-primary-dark text-white gap-2">
                <Plus className="w-4 h-4" /> New Observation
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Open-ended notes from community immersion. Use these to seed formal community
            needs once a pattern emerges. Authentic observations may not fit a checklist —
            write what you saw, where, and what action might help.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search observation, sitio, barangay…"
                className="h-9 pl-8 text-sm focus-visible:ring-primary/30"
              />
            </div>
            <select
              value={brgyFilter}
              onChange={(e) => setBrgyFilter(e.target.value)}
              className="h-9 px-3 text-sm rounded-xl border border-border bg-card outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All barangays</option>
              {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="h-9 px-3 text-sm rounded-xl border border-border bg-card outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select
              value={promotedFilter}
              onChange={(e) => setPromotedFilter(e.target.value as "" | "yes" | "no")}
              className="h-9 px-3 text-sm rounded-xl border border-border bg-card outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All statuses</option>
              <option value="no">Pending review</option>
              <option value="yes">Promoted to need</option>
            </select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setBrgyFilter(""); setCatFilter(""); setPromotedFilter(""); }} className="h-9 text-muted-foreground gap-1">
                <X className="w-3.5 h-3.5" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="border-border shadow-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {observations.length === 0
                  ? "No observations recorded yet. Click New Observation to start your Phase I journal."
                  : "No observations match your filters."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((o) => {
                const catMeta = o.category ? CATEGORY_META[o.category] : null;
                return (
                  <div key={o.id} className="p-4 hover:bg-surface-alt/30 transition-colors">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {fmtDate(o.observation_date)}
                          </span>
                          {catMeta && (
                            <Badge className={`${catMeta.color} text-[10px] border px-1.5 py-0`}>
                              {catMeta.label}
                            </Badge>
                          )}
                          {o.barangays && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {o.barangays.name}
                              {o.sitio && <span>· {o.sitio}</span>}
                            </span>
                          )}
                          {o.promoted_to_need && (
                            <Badge className="bg-success/10 text-success border-success/20 border text-[10px]">
                              → {o.promoted_to_need.title}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-line">
                          {o.observation}
                        </p>
                        {o.follow_up_action && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            <strong className="text-foreground">Action:</strong> {o.follow_up_action}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          Recorded by {o.users?.full_name ?? "Researcher"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!o.promoted_to_need && (
                          <button
                            onClick={() => promoteToNeed(o)}
                            className={cn(
                              "h-7 px-2.5 text-xs rounded-lg border transition-colors flex items-center gap-1",
                              "border-success/30 text-success hover:bg-success/5"
                            )}
                            title="Use this observation to seed a formal community need"
                          >
                            <ArrowRight className="w-3 h-3" /> Promote
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(o)}
                          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteObs(o.id)}
                          disabled={deletingId === o.id}
                          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-danger/10 text-muted-foreground hover:text-danger disabled:opacity-50"
                        >
                          {deletingId === o.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dlg} onOpenChange={(o) => { if (!o) setDlg(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              {editingId ? "Edit Observation" : "New Field Observation"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date <span className="text-danger">*</span></Label>
                <Input
                  type="date"
                  value={form.observation_date}
                  onChange={(e) => setForm({ ...form, observation_date: e.target.value })}
                  className="focus-visible:ring-primary/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full h-9 px-3 text-sm rounded-xl border border-border bg-card outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— None / unsorted —</option>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Barangay</Label>
                <select
                  value={form.barangay_id}
                  onChange={(e) => setForm({ ...form, barangay_id: e.target.value })}
                  className="w-full h-9 px-3 text-sm rounded-xl border border-border bg-card outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— Not specified —</option>
                  {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Sitio / Purok</Label>
                <Input
                  value={form.sitio}
                  onChange={(e) => setForm({ ...form, sitio: e.target.value })}
                  placeholder="e.g. Sitio Bihunan"
                  className="focus-visible:ring-primary/30"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observation <span className="text-danger">*</span></Label>
              <Textarea
                rows={5}
                value={form.observation}
                onChange={(e) => setForm({ ...form, observation: e.target.value })}
                placeholder="What did you see, hear, or learn? Be specific — who, where, when."
                className="focus-visible:ring-primary/30 resize-none text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                10+ characters. Use first-person voice. Capture context — not just the
                problem, but how it was raised.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Suggested follow-up action <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                rows={2}
                value={form.follow_up_action}
                onChange={(e) => setForm({ ...form, follow_up_action: e.target.value })}
                placeholder="e.g. revisit next week with health team, consult barangay captain"
                className="focus-visible:ring-primary/30 resize-none text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary-dark text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? "Update" : "Record")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
