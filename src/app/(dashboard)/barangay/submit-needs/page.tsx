"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckCircle, Loader2, ClipboardList, Clock, XCircle, AlertCircle, CheckCircle2, RotateCcw, MessageSquareQuote, FileEdit,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import { SectionTabs } from "@/components/layout/SectionTabs";

const CATEGORIES = [
  { value: "health",        label: "Health",        desc: "Medical access, sanitation, nutrition" },
  { value: "livelihood",    label: "Livelihood",    desc: "Employment, income, and household livelihoods" },
  { value: "education",     label: "Education",     desc: "Learning access and educational support" },
  { value: "infrastructure", label: "Infrastructure", desc: "Roads, water, facilities, and public utilities" },
  { value: "environment",   label: "Environment",   desc: "Waste, flooding, pollution, and resilience" },
];

const schema = z.object({
  category:      z.enum(["health", "livelihood", "education", "infrastructure", "environment"], { error: "Select a category" }),
  title:         z.string().min(3, "Title must be at least 3 characters"),
  description:   z.string().min(10, "Please describe the need in more detail"),
  priority:      z.enum(["high", "medium", "low"]),
  affected_count: z.string().optional(),
  sitio:         z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface NeedRow {
  id:               string;
  title:            string;
  description:      string | null;
  category:         string;
  priority:         string;
  affected_count:   number | null;
  sitio:             string | null;
  approval_status:  string;
  approval_notes:   string | null;
  approved_at:      string | null;
  created_at:       string;
  updated_at:       string;
  users:            { full_name: string } | null;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending_paraya_review: { label: "Awaiting PARAYA Review", cls: "bg-warning/10 text-warning border-warning/20 border", icon: Clock },
  approved:        { label: "Approved",          cls: "bg-success/10 text-success border-success/20 border", icon: CheckCircle2 },
  rejected:        { label: "Rejected",          cls: "bg-danger/10 text-danger border-danger/20 border",     icon: XCircle      },
  needs_revision:  { label: "Needs Revision",    cls: "bg-info/10 text-info border-info/20 border",           icon: AlertCircle  },
  draft:           { label: "Draft",             cls: "bg-muted text-muted-foreground border",                icon: FileEdit     },
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "needs_revision", label: "Needs revision" },
  { value: "pending_paraya_review", label: "Awaiting review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SubmitNeedsPage() {
  return (
    <div className="space-y-5">
      <SectionTabs section="barangay.needs-assessment" label="Community Needs Assessment sections" />
      <Suspense>
        <SubmitNeeds />
      </Suspense>
    </div>
  );
}

function SubmitNeeds() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [editingNeed, setEditingNeed] = useState<NeedRow | null>(null);

  const [needs,     setNeeds]     = useState<NeedRow[]>([]);
  const [loadingNeeds, setLoadingNeeds] = useState(true);
  const [filter,    setFilter]    = useState<(typeof FILTERS)[number]["value"]>("all");
  const [sitios,    setSitios]    = useState<string[]>([]);

  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: "medium" },
  });

  const selectedCategory = watch("category");
  const selectedPriority = watch("priority");

  // ── Every submission for this barangay (the API scopes the Secretary to it) ──
  const fetchNeeds = useCallback(async () => {
    setLoadingNeeds(true);
    const res = await fetch("/api/community-needs?status=all");
    if (res.ok) {
      const j = await res.json();
      setNeeds(j.data ?? []);
    } else {
      toast.error("Your submissions could not be loaded. Refresh to try again.");
    }
    setLoadingNeeds(false);
  }, []);

  useEffect(() => { fetchNeeds(); }, [fetchNeeds]);
  useEffect(() => {
    fetch("/api/barangay/sitios")
      .then((res) => (res.ok ? res.json() : null))
      .then((j: { data?: Array<{ name: string }> } | null) => setSitios((j?.data ?? []).map((row) => row.name)))
      .catch(() => setSitios([]));
  }, []);

  const startRevision = useCallback((need: NeedRow) => {
    setEditingNeed(need);
    setSubmitted(false);
    reset({
      category: need.category as FormData["category"],
      title: need.title,
      description: need.description ?? "",
      priority: need.priority as FormData["priority"],
      affected_count: need.affected_count?.toString() ?? "",
      sitio: need.sitio ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [reset]);

  // Dashboard links open a returned need directly: /barangay/submit-needs?revise=<id>
  const reviseId = searchParams.get("revise");
  useEffect(() => {
    if (!reviseId || loadingNeeds) return;
    const need = needs.find((row) => row.id === reviseId && row.approval_status === "needs_revision");
    if (need) startRevision(need);
    router.replace("/barangay/submit-needs");
  }, [reviseId, loadingNeeds, needs, startRevision, router]);

  function cancelRevision() {
    setEditingNeed(null);
    reset({ priority: "medium", title: "", description: "", affected_count: "", sitio: "" });
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    const res = await fetch(editingNeed ? `/api/community-needs/${editingNeed.id}/resubmit` : "/api/community-needs", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        ...data,
        affected_count: data.affected_count ? parseInt(data.affected_count, 10) : null,
        sitio:          data.sitio?.trim() || null,
        ...(editingNeed ? { expected_updated_at: editingNeed.updated_at } : {}),
      }),
    });
    if (res.ok) {
      setEditingNeed(null);
      setSubmitted(true);
      fetchNeeds();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to submit. Please try again.");
    }
    setLoading(false);
  }

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: needs.length };
    for (const row of needs) result[row.approval_status] = (result[row.approval_status] ?? 0) + 1;
    return result;
  }, [needs]);
  const returned = needs.filter((row) => row.approval_status === "needs_revision");
  const visible = filter === "all" ? needs : needs.filter((row) => row.approval_status === filter);
  const kpis = [
    { key: "all", label: "Total submitted", value: counts.all ?? 0, hint: "All submissions", icon: ClipboardList, tone: "border-l-accent", tile: "bg-accent/15 text-accent" },
    { key: "pending_paraya_review", label: "Awaiting PARAYA review", value: counts.pending_paraya_review ?? 0, hint: "With a PARAYA Officer", icon: Clock, tone: "border-l-warning", tile: "bg-warning/10 text-warning" },
    { key: "needs_revision", label: "Needs revision", value: counts.needs_revision ?? 0, hint: "Returned to your barangay", icon: RotateCcw, tone: "border-l-info", tile: "bg-info/10 text-info" },
    { key: "approved", label: "Approved", value: counts.approved ?? 0, hint: `${counts.rejected ?? 0} rejected`, icon: CheckCircle2, tone: "border-l-success", tile: "bg-success/10 text-success" },
  ] as const;

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 animate-fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-success/10 mb-4">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-foreground mb-2">Submitted for PARAYA Review</h2>
        <p className="text-muted-foreground mb-6">
          Your submission is now awaiting review by a PARAYA Officer.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button
            onClick={() => { setSubmitted(false); reset({ priority: "medium", title: "", description: "", affected_count: "", sitio: "" }); }}
            className="bg-primary hover:bg-primary-dark text-white"
          >
            Submit Another
          </Button>
          <Button
            onClick={() => {
              setSubmitted(false);
              reset({ priority: "medium", title: "", description: "", affected_count: "", sitio: "" });
              setFilter("all");
              setTimeout(() => document.getElementById("my-submissions")?.scrollIntoView({ behavior: "smooth" }), 50);
            }}
            variant="outline"
          >
            View My Submissions
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards; each one filters My Submissions. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="needs-kpis">
        {kpis.map((kpi) => (
          <button
            key={kpi.key}
            type="button"
            aria-pressed={filter === kpi.key}
            onClick={() => { setFilter(kpi.key); document.getElementById("my-submissions")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}
            className={`flex flex-col justify-start rounded-xl border border-border border-l-4 ${kpi.tone} bg-card px-5 py-3 text-left shadow-card transition-colors hover:bg-surface-alt/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 font-heading text-3xl font-bold text-foreground">{loadingNeeds ? "—" : kpi.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{kpi.hint}</p>
              </div>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${kpi.tile}`}><kpi.icon className="h-5 w-5" aria-hidden="true" /></span>
            </div>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          {/* Submission form */}
          <Card className="border-border shadow-card">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-accent" />
                  {editingNeed ? "Revise Community Need" : "Community Needs Report"}
                </CardTitle>
                {editingNeed && <Button type="button" variant="ghost" size="sm" onClick={cancelRevision}>Cancel revision</Button>}
              </div>
              <p className="text-sm text-muted-foreground">
                {editingNeed ? "Update the returned submission and send it back for PARAYA Officer review." : "Report community needs directly to PARAYA for Officer review and action."}
              </p>
              {editingNeed?.approval_notes && (
                <div className="mt-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm" data-testid="revision-note">
                  <p className="text-xs font-semibold text-muted-foreground">PARAYA Officer&apos;s note</p>
                  <p className="mt-0.5 text-foreground">{editingNeed.approval_notes}</p>
                </div>
              )}
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

                {/* Category */}
                <div className="space-y-2">
                  <Label>Category <span className="text-danger">*</span></Label>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setValue("category", cat.value as FormData["category"], { shouldValidate: true })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedCategory === cat.value
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : "border-border hover:border-primary/40 hover:bg-surface-alt"
                        }`}
                      >
                        <p className={`text-sm font-semibold ${selectedCategory === cat.value ? "text-primary" : "text-foreground"}`}>
                          {cat.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{cat.desc}</p>
                      </button>
                    ))}
                  </div>
                  {errors.category && <p className="text-xs text-danger">{errors.category.message}</p>}
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <Label htmlFor="title">Need title <span className="text-danger">*</span></Label>
                  <Input
                    id="title"
                    placeholder="e.g. Lack of clean drinking water in Sitio Mabini"
                    className="focus-visible:ring-primary/30"
                    {...register("title")}
                  />
                  {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description <span className="text-danger">*</span></Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the situation in detail — how long it has been occurring, who is affected, what has been done so far…"
                    rows={4}
                    className="focus-visible:ring-primary/30 resize-none"
                    {...register("description")}
                  />
                  {errors.description && <p className="text-xs text-danger">{errors.description.message}</p>}
                </div>

                {/* Priority + Affected count */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Priority level</Label>
                    <div className="flex gap-2">
                      {(["high", "medium", "low"] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setValue("priority", p)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border capitalize transition-all ${
                            selectedPriority === p
                              ? p === "high"   ? "bg-danger/10 border-danger text-danger"
                              : p === "medium" ? "bg-warning/10 border-warning text-warning"
                              :                  "bg-success/10 border-success text-success"
                              : "border-border text-muted-foreground hover:border-primary/30"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="affected_count">Estimated affected residents</Label>
                    <Input
                      id="affected_count"
                      type="number"
                      min="0"
                      placeholder="0"
                      className="focus-visible:ring-primary/30"
                      {...register("affected_count")}
                    />
                  </div>
                </div>

                {/* Sitio */}
                <div className="space-y-1.5">
                  <Label htmlFor="sitio">Sitio / Purok <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="sitio"
                    list="barangay-sitio-options"
                    placeholder={sitios.length ? `e.g., ${sitios[0]}` : "e.g., Sitio Mabini, Purok 3"}
                    className="focus-visible:ring-primary/30"
                    {...register("sitio")}
                  />
                  <datalist id="barangay-sitio-options">
                    {sitios.map((name) => <option key={name} value={name} />)}
                  </datalist>
                  <p className="text-xs text-muted-foreground">
                    {sitios.length ? "Choose one of your barangay's registered sitios or type another location. " : ""}
                    Helps PARAYA target outreach to the specific sub-barangay where the need exists.
                  </p>
                </div>

                <div className="rounded-xl bg-info/5 border border-info/20 p-3 text-xs text-info flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>
                  PARAYA Officers review submissions. You&apos;ll receive a notification when a need is approved, rejected, or returned for revision.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="bg-primary hover:bg-primary-dark text-white px-6"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {editingNeed ? "Resubmit for PARAYA Review" : "Submit for PARAYA Review"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          {/* Returned needs come first: they are the Secretary's open action items. */}
          {!editingNeed && returned.length > 0 && (
            <Card className="border-accent/40 bg-accent/10 shadow-card" data-testid="returned-needs">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-primary" />
                  {returned.length} need{returned.length > 1 ? "s were" : " was"} returned for revision
                </CardTitle>
                <p className="text-xs text-muted-foreground">Update each one using the PARAYA Officer&apos;s note, then resubmit it for review.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {returned.map((need) => (
                  <div key={need.id} className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{need.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{need.category} · {need.priority} priority · submitted {fmtDate(need.created_at)}</p>
                      </div>
                      <Button size="sm" className="bg-primary hover:bg-primary-dark text-white shrink-0" onClick={() => startRevision(need)}>Revise</Button>
                    </div>
                    {need.approval_notes && (
                      <p className="text-xs text-foreground/80 flex gap-1.5"><MessageSquareQuote className="w-3.5 h-3.5 shrink-0 text-primary mt-0.5" /> {need.approval_notes}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* All submissions */}
          <Card id="my-submissions" className="border-border shadow-card scroll-mt-20">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-base">My Submissions</CardTitle>
              <p className="text-xs text-muted-foreground">
                Every need your barangay has submitted and its PARAYA review status.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-2" role="group" aria-label="Filter submissions by status">
                {FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === option.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                  >
                    {option.label} <span className="tabular-nums">{counts[option.value] ?? 0}</span>
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingNeeds ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                  <p className="text-xs">Loading…</p>
                </div>
              ) : visible.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{needs.length === 0 ? "No submissions yet." : "No submissions with this status."}</p>
              ) : (
                <PaginatedTable rows={visible} label="Submissions" resetKey={filter}>
                  {(pageRows) => (
                    <ul className="space-y-2 px-6 pb-4">
                      {pageRows.map((n) => {
                        const meta = STATUS_META[n.approval_status] ?? STATUS_META.pending_paraya_review;
                        const Icon = meta.icon;
                        return (
                          <li key={n.id} className="p-3 rounded-lg border border-border/60 bg-surface-alt/30 space-y-1">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                                <p className="text-xs text-muted-foreground capitalize">
                                  {n.category} · {n.priority} priority{n.sitio ? ` · ${n.sitio}` : ""} · {fmtDate(n.created_at)}
                                </p>
                              </div>
                              <Badge className={`${meta.cls} text-[11px] flex items-center gap-1 flex-shrink-0`}>
                                <Icon className="w-3 h-3" />
                                {meta.label}
                              </Badge>
                            </div>
                            {n.approval_notes && n.approval_status !== "approved" && (
                              <p className="text-xs text-muted-foreground italic pl-1 border-l-2 border-border ml-1">
                                PARAYA Officer&apos;s note: {n.approval_notes}
                              </p>
                            )}
                            {n.approval_status === "needs_revision" && <Button size="sm" variant="outline" onClick={() => startRevision(n)}>Revise and resubmit</Button>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </PaginatedTable>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
