"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckCircle, Loader2, ClipboardList, Clock, XCircle, AlertCircle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  approval_status:  string;
  approval_notes:   string | null;
  approved_at:      string | null;
  created_at:       string;
  users:            { full_name: string } | null;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending_captain: { label: "Awaiting Captain",  cls: "bg-warning/10 text-warning border-warning/20 border", icon: Clock        },
  approved:        { label: "Forwarded to PARAYA", cls: "bg-success/10 text-success border-success/20 border", icon: CheckCircle2 },
  rejected:        { label: "Rejected",          cls: "bg-danger/10 text-danger border-danger/20 border",     icon: XCircle      },
  needs_revision:  { label: "Needs Revision",    cls: "bg-info/10 text-info border-info/20 border",           icon: AlertCircle  },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SubmitNeedsPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);

  const [recent,    setRecent]    = useState<NeedRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: "medium" },
  });

  const selectedCategory = watch("category");
  const selectedPriority = watch("priority");

  // ── Fetch recent submissions for this barangay ────────────────────────────
  const fetchRecent = useCallback(async () => {
    setLoadingRecent(true);
    const res = await fetch("/api/community-needs?status=all");
    if (res.ok) {
      const j = await res.json();
      setRecent((j.data ?? []).slice(0, 10));
    }
    setLoadingRecent(false);
  }, []);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  async function onSubmit(data: FormData) {
    setLoading(true);
    const res = await fetch("/api/community-needs", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        ...data,
        affected_count: data.affected_count ? parseInt(data.affected_count, 10) : null,
        sitio:          data.sitio?.trim() || null,
      }),
    });
    if (res.ok) {
      setSubmitted(true);
      fetchRecent();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to submit. Please try again.");
    }
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 animate-fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-success/10 mb-4">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-foreground mb-2">Submitted for Approval</h2>
        <p className="text-muted-foreground mb-6">
          Your submission is now awaiting review by the Barangay Captain. Once approved, it will be forwarded to PARAYA for action.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button
            onClick={() => { setSubmitted(false); reset(); }}
            className="bg-primary hover:bg-primary-dark text-white"
          >
            Submit Another
          </Button>
          <Button
            onClick={() => { setSubmitted(false); reset(); }}
            variant="outline"
          >
            View My Submissions
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Submission form */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-accent" />
            Community Needs Report
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Report community needs for review by the Barangay Captain. Approved submissions are forwarded to PARAYA for planning and action.
          </p>
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
                placeholder="e.g., Sitio Mabini, Purok 3"
                className="focus-visible:ring-primary/30"
                {...register("sitio")}
              />
              <p className="text-xs text-muted-foreground">Helps PARAYA target outreach to the specific sub-barangay where the need exists.</p>
            </div>

            <div className="rounded-xl bg-info/5 border border-info/20 p-3 text-xs text-info flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                Submissions are reviewed by the Barangay Captain first. You&apos;ll receive a notification when it&apos;s approved (or sent back for revision).
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="bg-primary hover:bg-primary-dark text-white px-6"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Submit for Approval
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recent submissions */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-base">Recent Submissions</CardTitle>
          <p className="text-xs text-muted-foreground">
            Your barangay&apos;s last 10 submissions and their approval status.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingRecent ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
              <p className="text-xs">Loading…</p>
            </div>
          ) : recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((n) => {
                const meta = STATUS_META[n.approval_status] ?? STATUS_META.pending_captain;
                const Icon = meta.icon;
                return (
                  <li
                    key={n.id}
                    className="p-3 rounded-lg border border-border/60 bg-surface-alt/30 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {n.category} · {n.priority} priority · {fmtDate(n.created_at)}
                        </p>
                      </div>
                      <Badge className={`${meta.cls} text-[10px] flex items-center gap-1 flex-shrink-0`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </Badge>
                    </div>
                    {n.approval_notes && n.approval_status !== "approved" && (
                      <p className="text-xs text-muted-foreground italic pl-1 border-l-2 border-border ml-1">
                        Captain&apos;s note: {n.approval_notes}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
