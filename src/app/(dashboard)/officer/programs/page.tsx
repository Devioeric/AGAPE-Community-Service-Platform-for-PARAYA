"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import {
  Search, Loader2, Plus, MoreHorizontal, Pencil, Trash2,
  Users, Calendar, MapPin, DollarSign, ClipboardList, FileText, Map,
  CheckCircle2, Circle, AlertTriangle, Flag, BarChart3,
} from "lucide-react";
import { ActivityPhotos } from "@/components/shared/ActivityPhotos";
import { ProgramVolunteerMatchingPanel } from "@/components/volunteers/ProgramVolunteerMatchingPanel";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import dynamic from "next/dynamic";
import type { MapProgram } from "@/components/maps/ProgramMap";

const ProgramMap = dynamic(() => import("@/components/maps/ProgramMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center bg-surface-alt rounded-xl border border-border" style={{ height: 420 }}>
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Barangay { id: string; name: string; }

interface Program {
  id: string;
  title: string;
  description: string | null;
  barangay_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  max_volunteers: number | null;
  created_at: string;
  barangays: { name: string; latitude: number | null; longitude: number | null } | null;
  signup_count: number;
}

interface Activity {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  location: string | null;
  status: string;
  report_1: string | null;
  report_2: string | null;
  photo_count?: number;
}

interface BudgetItem {
  id: string;
  category: string;
  allocated: number;
  spent: number;
  description: string | null;
}

interface Signup {
  id: string;
  status: string;
  volunteer_id: string;
  users: { full_name: string; email: string } | null;
}

interface ProgramDetail extends Program {
  activities: Activity[];
  budgets: BudgetItem[];
  signups: Signup[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PROGRAM_BADGE: Record<string, string> = {
  draft:     "bg-muted/60 text-muted-foreground border border-border",
  active:    "bg-success/10 text-success border border-success/20",
  upcoming:  "bg-info/10 text-info border border-info/20",
  completed: "bg-primary/10 text-primary border border-primary/20",
  cancelled: "bg-danger/10 text-danger border border-danger/20",
};

const ACTIVITY_BADGE: Record<string, string> = {
  planned:   "bg-info/10 text-info border border-info/20",
  ongoing:   "bg-success/10 text-success border border-success/20",
  completed: "bg-primary/10 text-primary border border-primary/20",
  cancelled: "bg-danger/10 text-danger border border-danger/20",
};

// ─── Schemas ───────────────────────────────────────────────────────────────────

const programSchema = z.object({
  title:          z.string().min(3, "At least 3 characters"),
  description:    z.string().optional(),
  barangay_id:    z.string().optional(),
  start_date:     z.string().optional(),
  end_date:       z.string().optional(),
  status:         z.string(),
  max_volunteers: z.string().optional(),
});
type ProgramForm = z.infer<typeof programSchema>;

const activitySchema = z.object({
  title:       z.string().min(2, "Title required"),
  description: z.string().optional(),
  date:        z.string().optional(),
  location:    z.string().optional(),
  status:      z.string(),
});
type ActivityForm = z.infer<typeof activitySchema>;

const budgetSchema = z.object({
  category:    z.string().min(1, "Category required"),
  allocated:   z.string(),
  spent:       z.string().optional(),
  notes:       z.string().optional(),
});
type BudgetForm = z.infer<typeof budgetSchema>;

type DetailTab = "overview" | "activities" | "budget" | "volunteers";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OfficerProgramsPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [programs, setPrograms]   = useState<Program[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Program form sheet
  const [formOpen, setFormOpen] = useState(false);
  const [editProg, setEditProg] = useState<Program | null>(null);
  const [saving, setSaving]     = useState(false);

  // Detail sheet
  const [detailOpen, setDetailOpen]       = useState(false);
  const [detailProg, setDetailProg]       = useState<ProgramDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab]         = useState<DetailTab>("overview");

  // Assign-volunteer dialog
  const [assignOpen, setAssignOpen]   = useState(false);
  const [allVolunteers, setAllVolunteers] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [assigning, setAssigning]     = useState<string | null>(null);  // volunteer_id being saved
  const [removingId, setRemovingId]   = useState<string | null>(null);  // volunteer_id being removed

  // Activity dialog
  const [actFormOpen, setActFormOpen] = useState(false);
  const [editAct, setEditAct]         = useState<Activity | null>(null);
  const [actSaving, setActSaving]     = useState(false);

  // Report dialog
  const [reportAct, setReportAct]     = useState<Activity | null>(null);
  const [reportField, setReportField] = useState<"report_1" | "report_2">("report_1");
  const [reportText, setReportText]   = useState("");
  const [reportSaving, setReportSaving] = useState(false);

  // Budget dialog
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);
  const [budgetSaving, setBudgetSaving]     = useState(false);

  // Delete dialog

  // Map
  const [mapFilter, setMapFilter] = useState<"all" | "active" | "upcoming">("all");

  const programForm  = useForm<ProgramForm>({ resolver: zodResolver(programSchema), defaultValues: { title: "", status: "draft" } });
  const activityForm = useForm<ActivityForm>({ resolver: zodResolver(activitySchema), defaultValues: { title: "", status: "planned" } });
  const budgetForm   = useForm<BudgetForm>({ resolver: zodResolver(budgetSchema), defaultValues: { category: "", allocated: "0", spent: "0" } });

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    const [progRes, barRes] = await Promise.all([
      fetch("/api/programs"),
      fetch("/api/partnerships"),
    ]);
    if (progRes.ok) { const j = await progRes.json(); setPrograms(j.data ?? []); }
    if (barRes.ok)  { const j = await barRes.json(); setBarangays(j.data ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPrograms(); }, [fetchPrograms]);

  // ── Pre-fill from approved proposal ──────────────────────────────────────
  // When the officer clicks "Create Program from Proposal" on the proposals
  // page, we land here with ?fromProposal=<id>. Wait until barangays load so
  // the select can show the resolved name, fetch the proposal, then open the
  // New Program sheet with its fields seeded. The query param is stripped
  // after handling so a page refresh doesn't replay the prefill.
  const [prefillHandled, setPrefillHandled] = useState(false);
  useEffect(() => {
    const proposalId = searchParams.get("fromProposal");
    if (!proposalId || prefillHandled || loading) return;
    setPrefillHandled(true);
    (async () => {
      const res = await fetch(`/api/proposals/${proposalId}`);
      if (!res.ok) {
        toast.error("Could not load the proposal — opening a blank form.");
        setEditProg(null);
        programForm.reset({ title: "", status: "draft" });
        setFormOpen(true);
        router.replace("/officer/programs");
        return;
      }
      const { data: p } = await res.json();
      setEditProg(null);
      programForm.reset({
        title:          p.title ?? "",
        description:    p.rationale ?? p.objectives ?? "",
        barangay_id:    p.barangay_id ?? "",
        start_date:     p.timeline_start ?? "",
        end_date:       p.timeline_end ?? "",
        status:         "upcoming",
        max_volunteers: "",
      });
      setFormOpen(true);
      toast.success("Pre-filled from approved proposal — review and save.");
      router.replace("/officer/programs");
    })();
  }, [searchParams, prefillHandled, loading, programForm, router]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    const res = await fetch(`/api/programs/${id}`);
    if (res.ok) { const j = await res.json(); setDetailProg(j.data); }
    setDetailLoading(false);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return programs.filter((p) => {
      const matchQ = p.title.toLowerCase().includes(q) || (p.barangays?.name ?? "").toLowerCase().includes(q);
      const matchS = statusFilter === "all" || p.status === statusFilter;
      return matchQ && matchS;
    });
  }, [programs, search, statusFilter]);

  const counts = useMemo(() => ({
    total:     programs.length,
    active:    programs.filter((p) => p.status === "active").length,
    upcoming:  programs.filter((p) => p.status === "upcoming").length,
    completed: programs.filter((p) => p.status === "completed").length,
  }), [programs]);

  const mapPrograms = useMemo<MapProgram[]>(() =>
    programs
      .filter((p) => mapFilter === "all" || p.status === mapFilter)
      .map((p) => ({
        id: p.id, title: p.title, status: p.status,
        start_date: p.start_date, end_date: p.end_date,
        barangay_id: p.barangay_id,
        barangays: p.barangays
          ? { name: p.barangays.name, latitude: p.barangays.latitude, longitude: p.barangays.longitude }
          : null,
      })),
    [programs, mapFilter]
  );

  const budgetTotals = useMemo(() => {
    if (!detailProg) return { allocated: 0, spent: 0 };
    return detailProg.budgets.reduce(
      (acc, b) => ({ allocated: acc.allocated + (b.allocated ?? 0), spent: acc.spent + (b.spent ?? 0) }),
      { allocated: 0, spent: 0 }
    );
  }, [detailProg]);

  // ── Completion readiness ─────────────────────────────────────────────────────
  // Gates that must pass before a program can be marked complete.
  const completionGates = useMemo(() => {
    if (!detailProg) return { allPass: false, checks: [] as { label: string; passed: boolean }[] };
    const activeSignups = detailProg.signups.filter((s) => s.status !== "withdrawn").length;
    const activities    = detailProg.activities;
    const activitiesReady = activities.length > 0 && activities.every(
      (a) => !!a.report_1 && !!a.report_2
    );
    const photosOk = activities.length === 0 || activities.every((a) => (a.photo_count ?? 0) > 0);
    const overspent = budgetTotals.allocated > 0 && budgetTotals.spent > budgetTotals.allocated;

    const checks = [
      {
        label: activities.length === 0
          ? "Add at least one activity"
          : `All ${activities.length} activit${activities.length === 1 ? "y has" : "ies have"} both Activity & Financial reports`,
        passed: activitiesReady,
      },
      {
        label: activities.length === 0
          ? "Every activity has at least one photo"
          : `Every activity has at least one photo (${activities.filter((a) => (a.photo_count ?? 0) > 0).length}/${activities.length})`,
        passed: photosOk,
      },
      {
        label: "At least one budget item recorded",
        passed: detailProg.budgets.length > 0,
      },
      {
        label: "Spending within allocated budget",
        passed: !overspent,
      },
      {
        label: "At least one volunteer signed up",
        passed: activeSignups > 0,
      },
    ];
    return { allPass: checks.every((c) => c.passed), checks };
  }, [detailProg, budgetTotals]);

  async function markProgramComplete() {
    if (!detailProg) return;
    if (!completionGates.allPass) {
      toast.error("Resolve all completion gates first.");
      return;
    }
    const res = await fetch(`/api/programs/${detailProg.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status: "completed" }),
    });
    if (res.ok) {
      toast.success("Program marked as complete.");
      fetchDetail(detailProg.id);
      fetchPrograms();
    } else {
      toast.error("Failed to update program status.");
    }
  }

  // ── Program CRUD ─────────────────────────────────────────────────────────────

  function openCreate() {
    setEditProg(null);
    programForm.reset({ title: "", description: "", status: "draft" });
    setFormOpen(true);
  }

  function openEdit(p: Program) {
    setEditProg(p);
    programForm.reset({
      title:          p.title,
      description:    p.description ?? "",
      barangay_id:    p.barangay_id ?? "",
      start_date:     p.start_date  ?? "",
      end_date:       p.end_date    ?? "",
      status:         p.status,
      max_volunteers: p.max_volunteers?.toString() ?? "",
    });
    setFormOpen(true);
  }

  async function onProgramSubmit(values: ProgramForm) {
    setSaving(true);
    const payload = {
      title:          values.title,
      description:    values.description    || null,
      barangay_id:    values.barangay_id    || null,
      start_date:     values.start_date     || null,
      end_date:       values.end_date       || null,
      status:         values.status,
      max_volunteers: values.max_volunteers ? parseInt(values.max_volunteers) : null,
    };
    const res = editProg
      ? await fetch(`/api/programs/${editProg.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        })
      : await fetch("/api/programs", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
    if (res.ok) {
      toast.success(editProg ? "Program updated." : "Program created.");
      setFormOpen(false);
      fetchPrograms();
    } else {
      toast.error("Failed to save program.");
    }
    setSaving(false);
  }

  async function openDetail(p: Program) {
    setDetailTab("overview");
    setDetailProg(null);
    setDetailOpen(true);
    fetchDetail(p.id);
  }

  // ── Volunteer assignment ─────────────────────────────────────────────────────

  async function openAssign() {
    setAssignSearch("");
    setAssignOpen(true);
    if (allVolunteers.length === 0) {
      const res = await fetch("/api/volunteers");
      if (res.ok) { const j = await res.json(); setAllVolunteers(j.data ?? []); }
    }
  }

  async function assignVolunteer(volunteerId: string) {
    if (!detailProg) return;
    setAssigning(volunteerId);
    const res = await fetch(`/api/programs/${detailProg.id}/signup`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ volunteer_id: volunteerId }),
    });
    if (res.ok) {
      toast.success("Volunteer assigned.");
      fetchDetail(detailProg.id);
      fetchPrograms();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to assign volunteer.");
    }
    setAssigning(null);
  }

  async function removeVolunteer(volunteerId: string) {
    if (!detailProg) return;
    setRemovingId(volunteerId);
    const res = await fetch(
      `/api/programs/${detailProg.id}/signup?volunteer_id=${encodeURIComponent(volunteerId)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("Volunteer removed.");
      fetchDetail(detailProg.id);
      fetchPrograms();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to remove volunteer.");
    }
    setRemovingId(null);
  }

  // ── Activity CRUD ────────────────────────────────────────────────────────────

  function openAddActivity() {
    setEditAct(null);
    activityForm.reset({ title: "", description: "", status: "planned" });
    setActFormOpen(true);
  }

  function openEditActivity(a: Activity) {
    setEditAct(a);
    activityForm.reset({
      title:       a.title,
      description: a.description ?? "",
      date:        a.date        ?? "",
      location:    a.location    ?? "",
      status:      a.status,
    });
    setActFormOpen(true);
  }

  async function onActivitySubmit(values: ActivityForm) {
    if (!detailProg) return;
    setActSaving(true);
    const payload = {
      title:       values.title,
      description: values.description || null,
      date:        values.date        || null,
      location:    values.location    || null,
      status:      values.status,
    };
    const res = editAct
      ? await fetch(`/api/programs/${detailProg.id}/activities/${editAct.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        })
      : await fetch(`/api/programs/${detailProg.id}/activities`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
    if (res.ok) {
      toast.success(editAct ? "Activity updated." : "Activity added.");
      setActFormOpen(false);
      fetchDetail(detailProg.id);
    } else {
      toast.error("Failed to save activity.");
    }
    setActSaving(false);
  }

  // ── Reports ──────────────────────────────────────────────────────────────────

  function openReport(a: Activity, field: "report_1" | "report_2") {
    setReportAct(a);
    setReportField(field);
    setReportText(a[field] ?? "");
  }

  async function saveReport() {
    if (!detailProg || !reportAct) return;
    setReportSaving(true);
    const res = await fetch(`/api/programs/${detailProg.id}/activities/${reportAct.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ [reportField]: reportText }),
    });
    if (res.ok) {
      toast.success("Report saved.");
      setReportAct(null);
      fetchDetail(detailProg.id);
    } else {
      toast.error("Failed to save report.");
    }
    setReportSaving(false);
  }

  // ── Budget ───────────────────────────────────────────────────────────────────

  async function onBudgetSubmit(values: BudgetForm) {
    if (!detailProg) return;
    setBudgetSaving(true);
    const payload = {
      category:    values.category,
      allocated:   parseFloat(values.allocated)      || 0,
      spent:       parseFloat(values.spent ?? "0")   || 0,
      notes:       values.notes || null,
    };
    const res = await fetch(`/api/programs/${detailProg.id}/budget`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success("Budget item added.");
      setBudgetFormOpen(false);
      budgetForm.reset({ category: "", allocated: "0", spent: "0" });
      fetchDetail(detailProg.id);
    } else {
      toast.error("Failed to add budget item.");
    }
    setBudgetSaving(false);
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Programs", value: counts.total,     accent: "border-l-primary" },
          { label: "Active",         value: counts.active,    accent: "border-l-success" },
          { label: "Upcoming",       value: counts.upcoming,  accent: "border-l-info" },
          { label: "Completed",      value: counts.completed, accent: "border-l-accent" },
        ].map((c) => (
          <Card key={c.label} className={`border-border shadow-card border-l-4 ${c.accent}`}>
            <CardContent className="px-4 py-2.5">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold font-heading text-foreground mt-0.5">
                {loading ? "—" : c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Program Coverage Map */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Map className="w-5 h-5 text-primary" /> Program Coverage Map
            </CardTitle>
            <div className="flex gap-1 p-1 bg-surface-alt rounded-lg border border-border text-xs">
              {(["all", "active", "upcoming"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setMapFilter(v)}
                  className={`px-3 py-1 rounded-md font-medium transition-all capitalize ${
                    mapFilter === v
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Each pin represents a barangay with programs. Click to see program details.
            Pins show the barangay&apos;s most urgent program status.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center bg-surface-alt rounded-xl border border-border" style={{ height: 420 }}>
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ProgramMap programs={mapPrograms} height="420px" />
          )}
        </CardContent>
      </Card>

      {/* Programs table */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="font-heading text-lg">Programs</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search…"
                  className="pl-9 h-9 w-48 focus-visible:ring-primary/30"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <Button size="sm" onClick={openCreate} className="h-9 bg-primary hover:bg-primary-light text-white">
                <Plus className="w-4 h-4 mr-1.5" /> New Program
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Program</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Barangay</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden lg:table-cell">Dates</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden sm:table-cell">Volunteers</th>
                  <th className="py-3 px-4 w-10" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground">
                      {programs.length === 0 ? "No programs yet. Create your first program." : "No programs match your search."}
                    </td>
                  </tr>
                ) : filtered.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`border-b border-border/60 hover:bg-surface-alt/40 transition-colors cursor-pointer ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}
                    onClick={() => openDetail(p)}
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium text-foreground">{p.title}</p>
                      {p.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{p.description}</p>}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                      {p.barangays?.name ?? <span className="italic text-muted-foreground/50">Unassigned</span>}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground hidden lg:table-cell">
                      {p.start_date
                        ? `${fmtDate(p.start_date)}${p.end_date ? ` – ${fmtDate(p.end_date)}` : ""}`
                        : "—"}
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={`${PROGRAM_BADGE[p.status] ?? ""} capitalize text-xs`}>{p.status}</Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        {p.signup_count}{p.max_volunteers ? ` / ${p.max_volunteers}` : ""}
                      </span>
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuGroup>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openDetail(p)}>View Details</DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(p)}>Edit</DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">
            {filtered.length} of {programs.length} programs
          </div>
        </CardContent>
      </Card>

      {/* ── Create / Edit Program Sheet ─────────────────────────────────────────── */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
            <SheetTitle className="font-heading text-lg">{editProg ? "Edit Program" : "New Program"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={programForm.handleSubmit(onProgramSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Title <span className="text-danger">*</span></label>
                <Input {...programForm.register("title")} placeholder="Program title" className="focus-visible:ring-primary/30" />
                {programForm.formState.errors.title && (
                  <p className="text-xs text-danger">{programForm.formState.errors.title.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Description</label>
                <textarea
                  {...programForm.register("description")}
                  rows={3}
                  placeholder="Brief program description…"
                  className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Status</label>
                <select
                  {...programForm.register("status")}
                  className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="draft">Draft</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Partner Barangay</label>
                <select
                  value={programForm.watch("barangay_id") ?? ""}
                  onChange={(e) => programForm.setValue("barangay_id", e.target.value, { shouldDirty: true })}
                  className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— None —</option>
                  {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Start Date</label>
                  <Input type="date" {...programForm.register("start_date")} className="focus-visible:ring-primary/30" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">End Date</label>
                  <Input type="date" {...programForm.register("end_date")} className="focus-visible:ring-primary/30" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Max Volunteers</label>
                <Input
                  type="number" min={1}
                  {...programForm.register("max_volunteers")}
                  placeholder="Leave blank for unlimited"
                  className="focus-visible:ring-primary/30"
                />
              </div>
            </div>
            <div className="shrink-0 border-t border-border px-6 py-4 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-light text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editProg ? "Save Changes" : "Create Program")}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Program Detail Sheet ────────────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-4xl p-0 flex flex-col">
          {detailLoading || !detailProg ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Header */}
              <SheetHeader className="px-6 pt-5 border-b border-border shrink-0">
                <div className="flex items-start justify-between gap-3 pb-1">
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="font-heading text-xl leading-tight">{detailProg.title}</SheetTitle>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge className={`${PROGRAM_BADGE[detailProg.status] ?? ""} capitalize text-xs`}>
                        {detailProg.status}
                      </Badge>
                      {detailProg.barangays?.name && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {detailProg.barangays.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Link href={`/officer/programs/${detailProg.id}/analytics`}>
                      <Button size="sm" variant="outline" className="text-primary border-primary/30 hover:bg-primary/10">
                        <BarChart3 className="w-3.5 h-3.5 mr-1" /> Analytics
                      </Button>
                    </Link>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => { setDetailOpen(false); openEdit(detailProg); }}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                  </div>
                </div>

                {/* Tab nav */}
                <div className="flex -mb-px mt-3">
                  {(["overview", "activities", "budget", "volunteers"] as DetailTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                        detailTab === tab
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </SheetHeader>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto px-6 py-5">

                {/* Overview */}
                {detailTab === "overview" && (
                  <div className="space-y-5">
                    {detailProg.description && (
                      <div>
                        <p className="text-muted-foreground font-medium mb-1.5">Description</p>
                        <p className="text-sm text-foreground">{detailProg.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { icon: Users,         label: "Volunteers", value: `${detailProg.signups.length}${detailProg.max_volunteers ? ` / ${detailProg.max_volunteers}` : ""}` },
                        { icon: ClipboardList, label: "Activities", value: String(detailProg.activities.length) },
                        { icon: DollarSign,    label: "Budget Used", value: fmt(budgetTotals.spent) },
                      ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="p-4 rounded-xl border border-border bg-surface-alt/30 text-center">
                          <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-lg font-bold font-heading text-foreground mt-0.5">{value}</p>
                        </div>
                      ))}
                    </div>

                    {(detailProg.start_date || detailProg.end_date) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4 flex-shrink-0" />
                        <span>
                          {detailProg.start_date && fmtDate(detailProg.start_date)}
                          {detailProg.end_date   && ` – ${fmtDate(detailProg.end_date)}`}
                        </span>
                      </div>
                    )}

                    {budgetTotals.allocated > 0 && (
                      <div>
                        <p className="text-muted-foreground font-medium mb-2">Budget Utilization</p>
                        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, (budgetTotals.spent / budgetTotals.allocated) * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {fmt(budgetTotals.spent)} of {fmt(budgetTotals.allocated)} allocated
                          ({Math.round((budgetTotals.spent / budgetTotals.allocated) * 100)}%)
                        </p>
                      </div>
                    )}

                    {/* ── Completion readiness ──────────────────────────────────── */}
                    {detailProg.status !== "completed" && detailProg.status !== "cancelled" && (
                      <div className={`rounded-xl border p-4 ${
                        completionGates.allPass
                          ? "border-success/30 bg-success/5"
                          : "border-border bg-surface-alt/30"
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Flag className={`w-4 h-4 ${completionGates.allPass ? "text-success" : "text-muted-foreground"}`} />
                            <p className="font-medium text-sm text-foreground">Completion Readiness</p>
                          </div>
                          {completionGates.allPass && (
                            <span className="text-xs text-success font-medium">Ready to complete</span>
                          )}
                        </div>
                        <ul className="space-y-1.5 mb-3">
                          {completionGates.checks.map((c, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs">
                              {c.passed
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
                                : <Circle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0 mt-0.5" />}
                              <span className={c.passed ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                            </li>
                          ))}
                        </ul>
                        <Button
                          onClick={markProgramComplete}
                          disabled={!completionGates.allPass}
                          className="w-full bg-success hover:bg-success/90 text-white disabled:bg-muted disabled:text-muted-foreground gap-2"
                          size="sm"
                        >
                          {completionGates.allPass
                            ? <><CheckCircle2 className="w-4 h-4" /> Mark Program Complete</>
                            : <><AlertTriangle className="w-4 h-4" /> Resolve gates to complete</>}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Activities */}
                {detailTab === "activities" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {detailProg.activities.length} {detailProg.activities.length === 1 ? "Activity" : "Activities"}
                      </p>
                      <Button size="sm" onClick={openAddActivity} className="bg-primary hover:bg-primary-light text-white h-8 text-xs">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Activity
                      </Button>
                    </div>

                    {detailProg.activities.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-10 text-center">No activities yet.</p>
                    ) : detailProg.activities.map((a) => (
                      <div key={a.id} className="p-4 rounded-xl border border-border bg-surface-alt/20 space-y-3">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm text-foreground">{a.title}</p>
                              <Badge className={`${ACTIVITY_BADGE[a.status] ?? ""} capitalize text-xs`}>{a.status}</Badge>
                            </div>
                            {a.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.description}</p>}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                              {a.date     && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(a.date)}</span>}
                              {a.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{a.location}</span>}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors flex-shrink-0">
                              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuGroup>
                                <DropdownMenuItem className="cursor-pointer" onClick={() => openEditActivity(a)}>Edit</DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Two-report workflow per activity */}
                        <div className="flex gap-2 flex-wrap">
                          {([
                            { field: "report_1" as const, label: "Activity Report",    hint: "Narrative of what happened" },
                            { field: "report_2" as const, label: "Financial Report", hint: "Financial breakdown of spending" },
                          ]).map(({ field, label, hint }) => (
                            <button
                              key={field}
                              onClick={() => openReport(a, field)}
                              title={hint}
                              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                                a[field]
                                  ? "border-success/30 bg-success/10 text-success"
                                  : "border-border bg-surface text-muted-foreground hover:border-primary/30 hover:text-foreground"
                              }`}
                            >
                              <FileText className="w-3 h-3" />
                              {label}{a[field] ? " ✓" : ""}
                            </button>
                          ))}
                        </div>

                        {/* Photo gallery + uploader. Self-contained — fetches its
                            own list when mounted. We feed the count back so the
                            program-level completion checklist stays accurate
                            without a full refresh. */}
                        <ActivityPhotos
                          programId={detailProg.id}
                          activityId={a.id}
                          compact
                          onCountChange={(n) => {
                            setDetailProg((prev) => prev ? {
                              ...prev,
                              activities: prev.activities.map((x) =>
                                x.id === a.id ? { ...x, photo_count: n } : x
                              ),
                            } : prev);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Budget */}
                {detailTab === "budget" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {detailProg.budgets.length} Budget {detailProg.budgets.length === 1 ? "Item" : "Items"}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => { budgetForm.reset({ category: "", allocated: "0", spent: "0" }); setBudgetFormOpen(true); }}
                        className="bg-primary hover:bg-primary-light text-white h-8 text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
                      </Button>
                    </div>

                    {detailProg.budgets.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 p-4 rounded-xl border border-border bg-surface-alt/30">
                        <div>
                          <p className="text-xs text-muted-foreground">Total Allocated</p>
                          <p className="text-lg font-bold font-heading text-foreground">{fmt(budgetTotals.allocated)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Spent</p>
                          <p className={`text-lg font-bold font-heading ${budgetTotals.spent > budgetTotals.allocated ? "text-danger" : "text-foreground"}`}>
                            {fmt(budgetTotals.spent)}
                          </p>
                        </div>
                      </div>
                    )}

                    {detailProg.budgets.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-10 text-center">No budget items yet.</p>
                    ) : detailProg.budgets.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-transparent-alt/20">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{b.category}</p>
                          {b.description && <p className="text-xs text-muted-foreground mt-0.5">{b.description}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-foreground">{fmt(b.spent)}</p>
                          <p className="text-xs text-muted-foreground">of {fmt(b.allocated)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Volunteers */}
                {detailTab === "volunteers" && (
                  <div className="space-y-3">
                    <ProgramVolunteerMatchingPanel
                      programId={detailProg.id}
                      barangayId={detailProg.barangay_id}
                      maxVolunteers={detailProg.max_volunteers}
                      enrolledVolunteerIds={detailProg.signups.filter((signup) => signup.status !== "withdrawn").map((signup) => signup.volunteer_id)}
                      onChanged={() => { void fetchDetail(detailProg.id); void fetchPrograms(); }}
                    />
                    <div className="border-t border-border pt-4" />
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {detailProg.signups.filter((s) => s.status !== "withdrawn").length} Enrolled {detailProg.signups.filter((s) => s.status !== "withdrawn").length === 1 ? "Volunteer" : "Volunteers"}
                      </p>
                      <Button size="sm" onClick={openAssign} className="bg-primary hover:bg-primary-dark text-white gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        Assign Volunteer
                      </Button>
                    </div>
                    {detailProg.signups.filter((s) => s.status !== "withdrawn").length === 0 ? (
                      <p className="text-sm text-muted-foreground py-10 text-center">No volunteers signed up yet. Click <span className="font-medium">Assign Volunteer</span> to add one.</p>
                    ) : detailProg.signups
                      .filter((s) => s.status !== "withdrawn")
                      .map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-transparent-alt/20">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{s.users?.full_name ?? "Unknown"}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.users?.email}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge className={`capitalize text-xs ${
                              s.status === "confirmed"
                                ? "bg-success/10 text-success border border-success/20"
                                : "bg-info/10 text-info border border-info/20"
                            }`}>
                              {s.status}
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={removingId !== null}
                              onClick={() => removeVolunteer(s.volunteer_id)}
                              className="border-danger/30 text-danger hover:bg-danger/5 h-7 px-2"
                              title="Remove from program"
                            >
                              {removingId === s.volunteer_id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Trash2 className="w-3 h-3" />}
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Activity Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={actFormOpen} onOpenChange={setActFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{editAct ? "Edit Activity" : "Add Activity"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={activityForm.handleSubmit(onActivitySubmit)} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title <span className="text-danger">*</span></label>
              <Input {...activityForm.register("title")} placeholder="Activity title" className="focus-visible:ring-primary/30" />
              {activityForm.formState.errors.title && (
                <p className="text-xs text-danger">{activityForm.formState.errors.title.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <textarea
                {...activityForm.register("description")}
                rows={2}
                placeholder="What happens in this activity…"
                className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date</label>
                <Input type="date" {...activityForm.register("date")} className="focus-visible:ring-primary/30" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <select
                  {...activityForm.register("status")}
                  className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="planned">Planned</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Location</label>
              <Input {...activityForm.register("location")} placeholder="Activity venue or location" className="focus-visible:ring-primary/30" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={actSaving} className="bg-primary hover:bg-primary-light text-white">
                {actSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editAct ? "Save Changes" : "Add Activity")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Report Dialog ───────────────────────────────────────────────────────── */}
      <Dialog open={!!reportAct} onOpenChange={(open) => { if (!open) setReportAct(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {reportField === "report_1" ? "Activity Report" : "Financial Report"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {reportField === "report_1"
                ? "Narrative of what happened during the activity — attendance, outcomes, observations."
                : "Financial breakdown — items purchased, amounts spent, receipts attached, variance from budget."}
            </p>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">Activity: <span className="text-foreground font-medium">{reportAct?.title}</span></p>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              rows={9}
              placeholder={reportField === "report_1"
                ? "Describe what happened, who participated, outcomes achieved, challenges encountered…"
                : "List expenses by category: amount allocated, amount spent, balance, supporting receipts/notes…"}
              className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportAct(null)}>Cancel</Button>
            <Button disabled={reportSaving} onClick={saveReport} className="bg-primary hover:bg-primary-light text-white">
              {reportSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Budget Dialog ───────────────────────────────────────────────────────── */}
      <Dialog open={budgetFormOpen} onOpenChange={setBudgetFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Add Budget Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={budgetForm.handleSubmit(onBudgetSubmit)} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category <span className="text-danger">*</span></label>
              <Input {...budgetForm.register("category")} placeholder="e.g. Transportation, Supplies, Food" className="focus-visible:ring-primary/30" />
              {budgetForm.formState.errors.category && (
                <p className="text-xs text-danger">{budgetForm.formState.errors.category.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Allocated (₱)</label>
                <Input type="number" min={0} step="0.01" {...budgetForm.register("allocated")} className="focus-visible:ring-primary/30" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Spent (₱)</label>
                <Input type="number" min={0} step="0.01" {...budgetForm.register("spent")} className="focus-visible:ring-primary/30" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input {...budgetForm.register("notes")} placeholder="Optional note" className="focus-visible:ring-primary/30" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBudgetFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={budgetSaving} className="bg-primary hover:bg-primary-light text-white">
                {budgetSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────────────────────────────────── */}
      {/* ── Assign Volunteer Dialog ─────────────────────────────────────────── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Assign Volunteer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search by name or email…"
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              className="focus-visible:ring-primary/30"
            />
            <div className="max-h-80 overflow-y-auto scrollbar-thin space-y-1.5 pr-1">
              {(() => {
                const enrolled = new Set(
                  (detailProg?.signups ?? [])
                    .filter((s) => s.status !== "withdrawn")
                    .map((s) => s.volunteer_id)
                );
                const q = assignSearch.toLowerCase();
                const candidates = allVolunteers
                  .filter((v) => !enrolled.has(v.id))
                  .filter((v) =>
                    !q ||
                    v.full_name?.toLowerCase().includes(q) ||
                    v.email?.toLowerCase().includes(q)
                  );
                if (candidates.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      {allVolunteers.length === 0 ? "Loading volunteers…" : "No matching volunteers available."}
                    </p>
                  );
                }
                return candidates.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border hover:bg-surface-alt/50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{v.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{v.email}</p>
                    </div>
                    <Button
                      size="sm"
                      disabled={assigning !== null}
                      onClick={() => assignVolunteer(v.id)}
                      className="bg-primary hover:bg-primary-dark text-white h-7 px-3 text-xs gap-1"
                    >
                      {assigning === v.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Plus className="w-3 h-3" />}
                      Assign
                    </Button>
                  </div>
                ));
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
