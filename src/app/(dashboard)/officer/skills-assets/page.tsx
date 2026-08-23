"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wrench, GraduationCap, Plus, Pencil, Trash2, Loader2, MapPin,
  Sprout, Cpu, HeartPulse, Hammer, Box, Building2, Mountain, Layers,
  HelpCircle, Layout,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Barangay { id: string; name: string }

interface Skill {
  id:                 string;
  barangay_id:        string;
  skill_name:         string;
  category:           string;
  practitioner_count: number;
  proficiency_level:  string | null;
  notes:              string | null;
  barangays:          { name: string } | null;
}

interface Asset {
  id:          string;
  barangay_id: string;
  asset_name:  string;
  asset_type:  string;
  quantity:    number;
  condition:   string | null;
  notes:       string | null;
  barangays:   { name: string } | null;
}

type Tab = "skills" | "assets";

// ─── Constants ──────────────────────────────────────────────────────────────

const SKILL_CATEGORIES = [
  { value: "trade",       label: "Trade & Craft",   icon: Hammer       },
  { value: "education",   label: "Education",       icon: GraduationCap },
  { value: "health",      label: "Health",          icon: HeartPulse   },
  { value: "agriculture", label: "Agriculture",     icon: Sprout       },
  { value: "technology",  label: "Technology",      icon: Cpu          },
  { value: "other",       label: "Other",           icon: HelpCircle   },
];

const ASSET_TYPES = [
  { value: "facility",       label: "Facility",       icon: Building2 },
  { value: "equipment",      label: "Equipment",      icon: Box       },
  { value: "natural",        label: "Natural",        icon: Mountain  },
  { value: "infrastructure", label: "Infrastructure", icon: Layers    },
  { value: "other",          label: "Other",          icon: HelpCircle },
];

const PROFICIENCY = [
  { value: "",             label: "Not specified" },
  { value: "beginner",     label: "Beginner"      },
  { value: "intermediate", label: "Intermediate"  },
  { value: "advanced",     label: "Advanced"      },
];

const CONDITIONS = [
  { value: "",          label: "Not specified" },
  { value: "excellent", label: "Excellent"     },
  { value: "good",      label: "Good"          },
  { value: "fair",      label: "Fair"          },
  { value: "poor",      label: "Poor"          },
];

const PROFICIENCY_BADGE: Record<string, string> = {
  beginner:     "bg-info/10 text-info border-info/20 border",
  intermediate: "bg-warning/10 text-warning border-warning/20 border",
  advanced:     "bg-success/10 text-success border-success/20 border",
};

const CONDITION_BADGE: Record<string, string> = {
  excellent: "bg-success/10 text-success border-success/20 border",
  good:      "bg-info/10 text-info border-info/20 border",
  fair:      "bg-warning/10 text-warning border-warning/20 border",
  poor:      "bg-danger/10 text-danger border-danger/20 border",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const skillCatMeta = (v: string) =>
  SKILL_CATEGORIES.find((c) => c.value === v) ?? SKILL_CATEGORIES[SKILL_CATEGORIES.length - 1];

const assetTypeMeta = (v: string) =>
  ASSET_TYPES.find((t) => t.value === v) ?? ASSET_TYPES[ASSET_TYPES.length - 1];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SkillsAssetsPage() {
  const [tab, setTab] = useState<Tab>("skills");

  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [brgyFilter, setBrgyFilter] = useState<string>("");

  const [skills, setSkills] = useState<Skill[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  // Skill dialog
  const [skillDlg, setSkillDlg] = useState(false);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [skillForm, setSkillForm] = useState({
    barangay_id: "", skill_name: "", category: "trade",
    practitioner_count: 0, proficiency_level: "", notes: "",
  });
  const [skillSaving, setSkillSaving] = useState(false);

  // Asset dialog
  const [assetDlg, setAssetDlg] = useState(false);
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const [assetForm, setAssetForm] = useState({
    barangay_id: "", asset_name: "", asset_type: "facility",
    quantity: 1, condition: "", notes: "",
  });
  const [assetSaving, setAssetSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const q = brgyFilter ? `?barangay_id=${brgyFilter}` : "";
    const [bRes, sRes, aRes] = await Promise.all([
      fetch("/api/partnerships"),
      fetch(`/api/skills${q}`),
      fetch(`/api/assets${q}`),
    ]);

    if (bRes.ok) setBarangays((await bRes.json()).data ?? []);
    if (sRes.ok) setSkills((await sRes.json()).data ?? []);
    if (aRes.ok) setAssets((await aRes.json()).data ?? []);
    setLoading(false);
  }, [brgyFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Skill CRUD ───────────────────────────────────────────────────────────

  function openAddSkill() {
    setEditingSkill(null);
    setSkillForm({
      barangay_id: brgyFilter || (barangays[0]?.id ?? ""),
      skill_name:  "", category: "trade",
      practitioner_count: 0, proficiency_level: "", notes: "",
    });
    setSkillDlg(true);
  }

  function openEditSkill(s: Skill) {
    setEditingSkill(s.id);
    setSkillForm({
      barangay_id:        s.barangay_id,
      skill_name:         s.skill_name,
      category:           s.category,
      practitioner_count: s.practitioner_count,
      proficiency_level:  s.proficiency_level ?? "",
      notes:              s.notes ?? "",
    });
    setSkillDlg(true);
  }

  async function saveSkill() {
    if (!skillForm.barangay_id) { toast.error("Select a barangay."); return; }
    if (!skillForm.skill_name.trim()) { toast.error("Skill name is required."); return; }

    setSkillSaving(true);
    const url    = editingSkill ? `/api/skills/${editingSkill}` : "/api/skills";
    const method = editingSkill ? "PATCH" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...skillForm,
        skill_name: skillForm.skill_name.trim(),
        proficiency_level: skillForm.proficiency_level || null,
        notes: skillForm.notes.trim() || null,
      }),
    });

    if (res.ok) {
      toast.success(editingSkill ? "Skill updated." : "Skill added.");
      setSkillDlg(false);
      fetchAll();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to save skill.");
    }
    setSkillSaving(false);
  }

  async function deleteSkill(id: string) {
    if (!confirm("Delete this skill record?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Skill removed.");
      setSkills((prev) => prev.filter((s) => s.id !== id));
    } else {
      toast.error("Failed to delete skill.");
    }
    setDeletingId(null);
  }

  // ── Asset CRUD ───────────────────────────────────────────────────────────

  function openAddAsset() {
    setEditingAsset(null);
    setAssetForm({
      barangay_id: brgyFilter || (barangays[0]?.id ?? ""),
      asset_name: "", asset_type: "facility",
      quantity: 1, condition: "", notes: "",
    });
    setAssetDlg(true);
  }

  function openEditAsset(a: Asset) {
    setEditingAsset(a.id);
    setAssetForm({
      barangay_id: a.barangay_id,
      asset_name:  a.asset_name,
      asset_type:  a.asset_type,
      quantity:    a.quantity,
      condition:   a.condition ?? "",
      notes:       a.notes ?? "",
    });
    setAssetDlg(true);
  }

  async function saveAsset() {
    if (!assetForm.barangay_id) { toast.error("Select a barangay."); return; }
    if (!assetForm.asset_name.trim()) { toast.error("Asset name is required."); return; }

    setAssetSaving(true);
    const url    = editingAsset ? `/api/assets/${editingAsset}` : "/api/assets";
    const method = editingAsset ? "PATCH" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...assetForm,
        asset_name: assetForm.asset_name.trim(),
        condition: assetForm.condition || null,
        notes: assetForm.notes.trim() || null,
      }),
    });

    if (res.ok) {
      toast.success(editingAsset ? "Asset updated." : "Asset added.");
      setAssetDlg(false);
      fetchAll();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to save asset.");
    }
    setAssetSaving(false);
  }

  async function deleteAsset(id: string) {
    if (!confirm("Delete this asset record?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Asset removed.");
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } else {
      toast.error("Failed to delete asset.");
    }
    setDeletingId(null);
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  const skillsByCategory = SKILL_CATEGORIES.map((c) => ({
    ...c,
    count: skills.filter((s) => s.category === c.value).length,
    practitioners: skills.filter((s) => s.category === c.value).reduce((sum, s) => sum + s.practitioner_count, 0),
  }));

  const assetsByType = ASSET_TYPES.map((t) => ({
    ...t,
    count:    assets.filter((a) => a.asset_type === t.value).length,
    quantity: assets.filter((a) => a.asset_type === t.value).reduce((sum, a) => sum + a.quantity, 0),
  }));

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
          <Layout className="w-5 h-5 text-primary" /> Skills &amp; Assets Documentation
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Document community-level skills and assets per partner barangay. Information is recorded at the barangay level — no individual profiling.
        </p>
      </div>

      {/* Tab bar + barangay filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("skills")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === "skills"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <Wrench className="w-4 h-4" /> Skills
            <Badge className="ml-1 bg-muted/40 text-muted-foreground border-0 text-[10px]">
              {skills.length}
            </Badge>
          </button>
          <button
            onClick={() => setTab("assets")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === "assets"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <Box className="w-4 h-4" /> Assets
            <Badge className="ml-1 bg-muted/40 text-muted-foreground border-0 text-[10px]">
              {assets.length}
            </Badge>
          </button>
        </div>

        <div className="flex items-center gap-2 pb-2">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={brgyFilter}
            onChange={(e) => setBrgyFilter(e.target.value)}
            className="h-9 px-3 text-sm min-w-[200px]"
          >
            <option value="">All barangays</option>
            {barangays.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <Button
            onClick={tab === "skills" ? openAddSkill : openAddAsset}
            size="sm"
            className="bg-primary hover:bg-primary-dark text-white gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add {tab === "skills" ? "Skill" : "Asset"}
          </Button>
        </div>
      </div>

      {/* ── SKILLS TAB ─────────────────────────────────────────────────────── */}
      {tab === "skills" && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {skillsByCategory.map((c) => {
              const Icon = c.icon;
              return (
                <Card key={c.value} className="border-border shadow-card">
                  <CardContent className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-[11px] text-muted-foreground truncate">{c.label}</p>
                    </div>
                    <p className="text-xl font-bold font-heading text-foreground">{c.count}</p>
                    <p className="text-[10px] text-muted-foreground">{c.practitioners.toLocaleString()} people</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Table */}
          <Card className="border-border shadow-card">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-16 text-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading skills…
                </div>
              ) : skills.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No skills documented yet.</p>
                  <p className="text-xs mt-1">Click <strong>Add Skill</strong> to record community skills.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-border bg-surface-alt/50">
                        <th className="text-left py-3 px-4 text-muted-foreground font-medium">Skill</th>
                        <th className="text-left py-3 px-4 text-muted-foreground font-medium">Category</th>
                        <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Barangay</th>
                        <th className="text-right py-3 px-4 text-muted-foreground font-medium">Practitioners</th>
                        <th className="text-left py-3 px-4 text-muted-foreground font-medium">Proficiency</th>
                        <th className="py-3 px-4 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {skills.map((s, i) => {
                        const cat = skillCatMeta(s.category);
                        const Icon = cat.icon;
                        return (
                          <tr key={s.id} className={`border-b border-border/60 ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                            <td className="py-3 px-4">
                              <p className="font-medium text-foreground">{s.skill_name}</p>
                              {s.notes && <p className="text-xs text-muted-foreground line-clamp-1">{s.notes}</p>}
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1 text-xs text-foreground/80">
                                <Icon className="w-3.5 h-3.5 text-muted-foreground" /> {cat.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                              {s.barangays?.name ?? "—"}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-foreground tabular-nums">
                              {s.practitioner_count.toLocaleString()}
                            </td>
                            <td className="py-3 px-4">
                              {s.proficiency_level ? (
                                <Badge className={`${PROFICIENCY_BADGE[s.proficiency_level] ?? ""} text-[10px] capitalize`}>
                                  {s.proficiency_level}
                                </Badge>
                              ) : <span className="text-xs text-muted-foreground/50">—</span>}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEditSkill(s)} className="w-7 h-7 rounded-md hover:bg-surface-alt flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteSkill(s.id)} disabled={deletingId === s.id} className="w-7 h-7 rounded-md hover:bg-danger/10 flex items-center justify-center text-muted-foreground hover:text-danger transition-colors disabled:opacity-40" aria-label="Delete">
                                  {deletingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ASSETS TAB ─────────────────────────────────────────────────────── */}
      {tab === "assets" && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {assetsByType.map((t) => {
              const Icon = t.icon;
              return (
                <Card key={t.value} className="border-border shadow-card">
                  <CardContent className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-[11px] text-muted-foreground truncate">{t.label}</p>
                    </div>
                    <p className="text-xl font-bold font-heading text-foreground">{t.count}</p>
                    <p className="text-[10px] text-muted-foreground">{t.quantity.toLocaleString()} units</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-border shadow-card">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-16 text-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading assets…
                </div>
              ) : assets.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <Box className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No assets documented yet.</p>
                  <p className="text-xs mt-1">Click <strong>Add Asset</strong> to record community assets.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-border bg-surface-alt/50">
                        <th className="text-left py-3 px-4 text-muted-foreground font-medium">Asset</th>
                        <th className="text-left py-3 px-4 text-muted-foreground font-medium">Type</th>
                        <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Barangay</th>
                        <th className="text-right py-3 px-4 text-muted-foreground font-medium">Quantity</th>
                        <th className="text-left py-3 px-4 text-muted-foreground font-medium">Condition</th>
                        <th className="py-3 px-4 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {assets.map((a, i) => {
                        const t = assetTypeMeta(a.asset_type);
                        const Icon = t.icon;
                        return (
                          <tr key={a.id} className={`border-b border-border/60 ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                            <td className="py-3 px-4">
                              <p className="font-medium text-foreground">{a.asset_name}</p>
                              {a.notes && <p className="text-xs text-muted-foreground line-clamp-1">{a.notes}</p>}
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1 text-xs text-foreground/80">
                                <Icon className="w-3.5 h-3.5 text-muted-foreground" /> {t.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                              {a.barangays?.name ?? "—"}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-foreground tabular-nums">
                              {a.quantity.toLocaleString()}
                            </td>
                            <td className="py-3 px-4">
                              {a.condition ? (
                                <Badge className={`${CONDITION_BADGE[a.condition] ?? ""} text-[10px] capitalize`}>
                                  {a.condition}
                                </Badge>
                              ) : <span className="text-xs text-muted-foreground/50">—</span>}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEditAsset(a)} className="w-7 h-7 rounded-md hover:bg-surface-alt flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteAsset(a.id)} disabled={deletingId === a.id} className="w-7 h-7 rounded-md hover:bg-danger/10 flex items-center justify-center text-muted-foreground hover:text-danger transition-colors disabled:opacity-40" aria-label="Delete">
                                  {deletingId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Skill Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={skillDlg} onOpenChange={(o) => { if (!o) setSkillDlg(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Wrench className="w-4 h-4 text-primary" /> {editingSkill ? "Edit Skill" : "Add Skill"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Barangay</Label>
              <select
                value={skillForm.barangay_id}
                onChange={(e) => setSkillForm({ ...skillForm, barangay_id: e.target.value })}
                className="w-full h-9 px-3 text-sm"
              >
                <option value="">— Select a barangay —</option>
                {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Skill name</Label>
              <Input
                value={skillForm.skill_name}
                onChange={(e) => setSkillForm({ ...skillForm, skill_name: e.target.value })}
                placeholder="e.g., Carpentry, Tutoring"
                className="focus-visible:ring-primary/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <select
                  value={skillForm.category}
                  onChange={(e) => setSkillForm({ ...skillForm, category: e.target.value })}
                  className="w-full h-9 px-3 text-sm"
                >
                  {SKILL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Proficiency</Label>
                <select
                  value={skillForm.proficiency_level}
                  onChange={(e) => setSkillForm({ ...skillForm, proficiency_level: e.target.value })}
                  className="w-full h-9 px-3 text-sm"
                >
                  {PROFICIENCY.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Number of practitioners</Label>
              <Input
                type="number" min={0}
                value={skillForm.practitioner_count}
                onChange={(e) => setSkillForm({ ...skillForm, practitioner_count: Number(e.target.value) || 0 })}
                className="focus-visible:ring-primary/30"
              />
              <p className="text-xs text-muted-foreground">Aggregate count — no individuals are named.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                rows={2}
                value={skillForm.notes}
                onChange={(e) => setSkillForm({ ...skillForm, notes: e.target.value })}
                className="focus-visible:ring-primary/30 resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkillDlg(false)}>Cancel</Button>
            <Button onClick={saveSkill} disabled={skillSaving} className="bg-primary hover:bg-primary-dark text-white">
              {skillSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingSkill ? "Update Skill" : "Add Skill")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Asset Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={assetDlg} onOpenChange={(o) => { if (!o) setAssetDlg(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Box className="w-4 h-4 text-primary" /> {editingAsset ? "Edit Asset" : "Add Asset"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Barangay</Label>
              <select
                value={assetForm.barangay_id}
                onChange={(e) => setAssetForm({ ...assetForm, barangay_id: e.target.value })}
                className="w-full h-9 px-3 text-sm"
              >
                <option value="">— Select a barangay —</option>
                {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Asset name</Label>
              <Input
                value={assetForm.asset_name}
                onChange={(e) => setAssetForm({ ...assetForm, asset_name: e.target.value })}
                placeholder="e.g., Multi-purpose hall, Tricycle"
                className="focus-visible:ring-primary/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select
                  value={assetForm.asset_type}
                  onChange={(e) => setAssetForm({ ...assetForm, asset_type: e.target.value })}
                  className="w-full h-9 px-3 text-sm"
                >
                  {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <select
                  value={assetForm.condition}
                  onChange={(e) => setAssetForm({ ...assetForm, condition: e.target.value })}
                  className="w-full h-9 px-3 text-sm"
                >
                  {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number" min={0}
                value={assetForm.quantity}
                onChange={(e) => setAssetForm({ ...assetForm, quantity: Number(e.target.value) || 0 })}
                className="focus-visible:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                rows={2}
                value={assetForm.notes}
                onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })}
                className="focus-visible:ring-primary/30 resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssetDlg(false)}>Cancel</Button>
            <Button onClick={saveAsset} disabled={assetSaving} className="bg-primary hover:bg-primary-dark text-white">
              {assetSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingAsset ? "Update Asset" : "Add Asset")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
