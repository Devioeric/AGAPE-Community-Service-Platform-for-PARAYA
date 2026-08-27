"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, MoreHorizontal, Loader2, ChevronRight,
  FileText, Send, CheckCircle, XCircle, Search,
  RotateCcw, History, Workflow, Printer, Sparkles, CircleAlert,
} from "lucide-react";
import { derivePhase, PHASE_META, type PhaseKey } from "@/lib/proposals/phase";
import { ExportMenu } from "@/components/shared/ExportMenu";
import { CommunityValidationSection } from "@/components/shared/CommunityValidationSection";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AdvisoryRecommendationResponse } from "@/lib/ai/advisory-recommendations";
import { assessProposalAlignment, type ProposalAlignmentResult } from "@/lib/ai/proposal-alignment";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ProposalStatus =
  | "draft" | "submitted" | "pre_screening"
  | "sdg_review" | "finance_review" | "approved" | "rejected"
  | "revisions_requested";

type RecommendationDraftContext = {
  needId: string;
  recommendationFingerprint: string;
  category: string;
  barangayName: string;
  cycleName: string | null;
  evidenceSnapshotId: string | null;
  suggestedCount: number | null;
  asOfDate: string;
  limitation: string;
};

interface SdgAlignment { sdg_number: number; indicator?: string | null; }

interface PrescreeningCheck { name: string; passed: boolean; message: string; }

interface Proposal {
  id: string;
  title: string;
  rationale: string;
  objectives: string | null;
  target_beneficiaries: string | null;
  expected_beneficiary_count: number | null;
  expected_output: string | null;
  timeline_start: string | null;
  timeline_end: string | null;
  budget: number | null;
  status: ProposalStatus;
  is_income_generating: boolean;
  finance_clearance: boolean;
  finance_cleared_at: string | null;
  finance_notes: string | null;
  prescreening_passed: boolean | null;
  prescreening_checks: PrescreeningCheck[] | null;
  prescreening_ran_at: string | null;
  revision_count: number | null;
  revision_requested_from: string | null;
  community_validated: boolean | null;
  community_validation_notes: string | null;
  community_validated_at: string | null;
  informed_by_proposals: string[] | null;
  created_at: string;
  barangay_id: string | null;
  barangays: { name: string } | null;
  proposal_sdg_alignment: SdgAlignment[];
}

interface ProposalDetail extends Proposal {
  proposal_reviews: {
    id: string; stage: string; decision: string;
    notes: string | null; reviewed_at: string;
    users: { full_name: string } | null;
  }[];
}

interface Barangay { id: string; name: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES: { key: ProposalStatus; label: string }[] = [
  { key: "draft",          label: "Draft"           },
  { key: "submitted",      label: "Submitted"       },
  { key: "pre_screening",  label: "Pre-Screening"   },
  { key: "sdg_review",     label: "SDG Review"      },
  { key: "finance_review", label: "Finance Review"  },
  { key: "approved",       label: "Approved"        },
];

const ADVANCE_LABEL: Partial<Record<ProposalStatus, string>> = {
  draft:          "Submit for Review",
  submitted:      "Begin Pre-Screening",
  pre_screening:  "Pass Pre-Screening",
  sdg_review:     "Pass SDG Review",
  finance_review: "Approve Proposal",
};

const STATUS_BADGE: Record<ProposalStatus, string> = {
  draft:                "bg-muted text-muted-foreground border",
  submitted:            "bg-info/10 text-info border-info/20 border",
  pre_screening:        "bg-warning/10 text-warning border-warning/20 border",
  sdg_review:           "bg-warning/10 text-warning border-warning/20 border",
  finance_review:       "bg-warning/10 text-warning border-warning/20 border",
  approved:             "bg-success/10 text-success border-success/20 border",
  rejected:             "bg-danger/10 text-danger border-danger/20 border",
  revisions_requested:  "bg-accent/15 text-accent-foreground border-accent/30 border",
};

const SDG_META = [
  { n: 1,  label: "No Poverty",                         color: "#E5243B" },
  { n: 2,  label: "Zero Hunger",                        color: "#DDA63A" },
  { n: 3,  label: "Good Health & Well-being",            color: "#4C9F38" },
  { n: 4,  label: "Quality Education",                   color: "#C5192D" },
  { n: 5,  label: "Gender Equality",                     color: "#FF3A21" },
  { n: 6,  label: "Clean Water & Sanitation",             color: "#26BDE2" },
  { n: 7,  label: "Affordable & Clean Energy",            color: "#FCC30B" },
  { n: 8,  label: "Decent Work & Economic Growth",        color: "#A21942" },
  { n: 9,  label: "Industry, Innovation & Infrastructure", color: "#FD6925" },
  { n: 10, label: "Reduced Inequalities",                 color: "#DD1367" },
  { n: 11, label: "Sustainable Cities & Communities",      color: "#FD9D24" },
  { n: 12, label: "Responsible Consumption & Production", color: "#BF8B2E" },
  { n: 13, label: "Climate Action",                       color: "#3F7E44" },
  { n: 14, label: "Life Below Water",                     color: "#0A97D9" },
  { n: 15, label: "Life on Land",                         color: "#56C02B" },
  { n: 16, label: "Peace, Justice & Strong Institutions",  color: "#00689D" },
  { n: 17, label: "Partnerships for the Goals",            color: "#19486A" },
] as const;

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  title:                z.string().min(3, "Title is required"),
  rationale:            z.string().min(10, "Rationale is required"),
  objectives:           z.string().optional(),
  target_beneficiaries: z.string().optional(),
  expected_beneficiary_count: z.string().optional(),
  expected_output:      z.string().optional(),
  timeline_start:       z.string().optional(),
  timeline_end:         z.string().optional(),
  budget:               z.string().optional(),
  barangay_id:          z.string().optional(),
  is_income_generating: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function currency(n: number | null) {
  if (n == null) return "—";
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

// ─── Pipeline Stepper ─────────────────────────────────────────────────────────

function PipelineStepper({ status }: { status: ProposalStatus }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 text-sm text-danger font-medium">
        <XCircle className="w-4 h-4" /> Proposal Rejected
      </div>
    );
  }
  if (status === "revisions_requested") {
    return (
      <div className="flex items-center gap-2 text-sm text-accent-foreground font-medium">
        <RotateCcw className="w-4 h-4" /> Revisions Requested
      </div>
    );
  }
  const activeIdx = PIPELINE_STAGES.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PIPELINE_STAGES.map((s, i) => {
        const done    = i < activeIdx;
        const current = i === activeIdx;
        return (
          <div key={s.key} className="flex items-center gap-1">
            <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
              done    ? "bg-success/15 text-success"
              : current ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
            }`}>
              {done && <CheckCircle className="w-3 h-3" />}
              {s.label}
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recommendationHandled = useRef(false);
  const [proposals, setProposals]       = useState<Proposal[]>([]);
  const [barangays, setBarangays]       = useState<Barangay[]>([]);
  const [loading, setLoading]           = useState(true);

  // Form sheet state
  const [formOpen, setFormOpen]         = useState(false);
  const [editProposal, setEditProposal] = useState<Proposal | null>(null);
  const [sdgSelected, setSdgSelected]   = useState<number[]>([]);
  const [sdgIndicators, setSdgIndicators] = useState<Record<number, string>>({});
  // Lessons-learned: which prior proposals does this build on?
  const [informedBy, setInformedBy]       = useState<string[]>([]);
  const [saving, setSaving]             = useState(false);
  const [alignment, setAlignment]       = useState<ProposalAlignmentResult | null>(null);
  const [recommendationDraftContext, setRecommendationDraftContext] = useState<RecommendationDraftContext | null>(null);

  // Detail sheet state
  const [detailOpen, setDetailOpen]     = useState(false);
  const [detail, setDetail]             = useState<ProposalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewNotes, setReviewNotes]   = useState("");

  // Filter state
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showReviseForm, setShowReviseForm] = useState(false);
  const [advancing, setAdvancing]       = useState(false);

  const { register, handleSubmit, reset, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/proposals");
    if (res.ok) { const j = await res.json(); setProposals(j.data ?? []); }
    else toast.error("Failed to load proposals.");
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProposals();
    fetch("/api/partnerships").then((r) => r.json()).then((j) => setBarangays(j.data ?? []));
  }, [fetchProposals]);

  // ── Form sheet ──────────────────────────────────────────────────────────────

  function openCreate() {
    setEditProposal(null);
    setSdgSelected([]); setSdgIndicators({});
    setInformedBy([]);
    setAlignment(null);
    setRecommendationDraftContext(null);
    reset({});
    setFormOpen(true);
  }

  useEffect(() => {
    const needId = searchParams.get("from_need");
    if (!needId || recommendationHandled.current) return;
    recommendationHandled.current = true;

    void fetch("/api/ai/recommendations", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { data?: AdvisoryRecommendationResponse; error?: string } | null;
        if (!response.ok || !body?.data) throw new Error(body?.error ?? "Recommendation could not be loaded");
        const recommendation = body.data.recommendations.find((item) => item.needId === needId);
        if (!recommendation) throw new Error("This recommendation is no longer available");
        if (recommendation.action !== "develop_response") {
          throw new Error("This need already has a planned or active response. Review its coverage instead of preparing a duplicate draft.");
        }

        setEditProposal(null);
        setInformedBy([]);
        setAlignment(null);
        const supportedSdgs = new Set<number>(SDG_META.map((item) => item.n));
        setSdgSelected(recommendation.suggestedSdgs.filter((sdg) => supportedSdgs.has(sdg)));
        setSdgIndicators({});
        setRecommendationDraftContext({
          needId: recommendation.needId,
          recommendationFingerprint: recommendation.recommendationFingerprint,
          category: recommendation.category,
          barangayName: recommendation.barangay.name,
          cycleName: recommendation.evidence.profiling?.cycleName ?? null,
          evidenceSnapshotId: recommendation.evidence.profiling?.evidenceSnapshotId ?? null,
          suggestedCount: recommendation.beneficiaryGuidance.suggestedCount,
          asOfDate: recommendation.beneficiaryGuidance.asOfDate,
          limitation: recommendation.beneficiaryGuidance.limitation,
        });
        reset({
          title: recommendation.intervention.title,
          rationale: `${recommendation.rationale} Validate this advisory suggestion with the barangay and available evidence before submission.`,
          barangay_id: recommendation.barangay.id,
          target_beneficiaries: recommendation.beneficiaryGuidance.segmentLabel,
          expected_beneficiary_count: recommendation.beneficiaryGuidance.suggestedCount === null
            ? ""
            : String(recommendation.beneficiaryGuidance.suggestedCount),
        });
        setFormOpen(true);
        toast.info("A proposal draft was prefilled. Review and edit every field before saving.");
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Recommendation could not be loaded"))
      .finally(() => router.replace("/officer/proposals"));
  }, [reset, router, searchParams]);

  function openEdit(p: Proposal) {
    setEditProposal(p);
    const nums = (p.proposal_sdg_alignment ?? []).map((a) => a.sdg_number);
    setSdgSelected(nums);
    const ind: Record<number, string> = {};
    (p.proposal_sdg_alignment ?? []).forEach((a) => { if (a.indicator) ind[a.sdg_number] = a.indicator; });
    setSdgIndicators(ind);
    setInformedBy(((p as Proposal & { informed_by_proposals?: string[] | null }).informed_by_proposals) ?? []);
    setAlignment(null);
    setRecommendationDraftContext(null);
    reset({
      title:                p.title,
      rationale:            p.rationale,
      objectives:           p.objectives ?? "",
      target_beneficiaries: p.target_beneficiaries ?? "",
      expected_beneficiary_count: p.expected_beneficiary_count != null ? String(p.expected_beneficiary_count) : "",
      expected_output:      p.expected_output ?? "",
      timeline_start:       p.timeline_start ?? "",
      timeline_end:         p.timeline_end ?? "",
      budget:               p.budget != null ? String(p.budget) : "",
      barangay_id:          p.barangays ? Object.entries(barangays).find(([, b]) => b.name === p.barangays?.name)?.[1]?.id ?? "" : "",
      is_income_generating: p.is_income_generating ?? false,
    });
    setFormOpen(true);
  }

  function toggleSdg(n: number) {
    setSdgSelected((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]);
  }

  function runAlignmentCheck() {
    const values = getValues();
    const parsedBudget = values.budget?.trim() ? Number(values.budget) : null;
    setAlignment(assessProposalAlignment({
      title: values.title ?? "",
      rationale: values.rationale ?? "",
      objectives: values.objectives ?? "",
      targetBeneficiaries: values.target_beneficiaries ?? "",
      expectedBeneficiaryCount: values.expected_beneficiary_count?.trim()
        ? Number(values.expected_beneficiary_count)
        : null,
      expectedOutput: values.expected_output ?? "",
      timelineStart: values.timeline_start ?? "",
      timelineEnd: values.timeline_end ?? "",
      budget: parsedBudget !== null && Number.isFinite(parsedBudget) && parsedBudget >= 0 ? parsedBudget : null,
      barangayId: values.barangay_id || null,
      isIncomeGenerating: Boolean(values.is_income_generating),
      sdgs: sdgSelected,
      priorInitiativeCount: informedBy.length,
    }));
  }

  async function onSubmit(data: FormData) {
    setSaving(true);
    const payload = {
      ...data,
      budget:                data.budget ? parseFloat(data.budget) : null,
      expected_beneficiary_count: data.expected_beneficiary_count ? Number(data.expected_beneficiary_count) : null,
      barangay_id:           data.barangay_id || null,
      is_income_generating:  !!data.is_income_generating,
      sdg_alignments:        sdgSelected.map((n) => ({ sdg_number: n, indicator: sdgIndicators[n] ?? null })),
      informed_by_proposals: informedBy,
    };

    const res = editProposal
      ? await fetch(`/api/proposals/${editProposal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/proposals",                    { method: "POST",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    if (res.ok) {
      toast.success(editProposal ? "Proposal updated." : "Proposal created.");
      await fetchProposals();
      setFormOpen(false);
      setRecommendationDraftContext(null);
    } else {
      toast.error("Failed to save proposal.");
    }
    setSaving(false);
  }

  // ── Detail sheet ─────────────────────────────────────────────────────────────

  async function openDetail(id: string) {
    setDetail(null);
    setReviewNotes(""); setShowRejectForm(false);
    setDetailOpen(true);
    setDetailLoading(true);
    const res = await fetch(`/api/proposals/${id}`);
    if (res.ok) { const j = await res.json(); setDetail(j.data); }
    setDetailLoading(false);
  }

  async function advance(action: "advance" | "reject" | "request_revisions" | "resubmit") {
    if (!detail) return;
    if (action === "reject" && !reviewNotes.trim())            { toast.error("Rejection notes are required."); return; }
    if (action === "request_revisions" && !reviewNotes.trim()) { toast.error("Revision notes are required so the proponent knows what to change."); return; }
    setAdvancing(true);
    const res = await fetch(`/api/proposals/${detail.id}/advance`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action, notes: reviewNotes.trim() || null }),
    });
    if (res.ok) {
      const j = await res.json();
      const newStatus = j.status as ProposalStatus;
      setDetail((prev) => prev ? { ...prev, status: newStatus } : prev);
      setProposals((prev) => prev.map((p) => p.id === detail.id ? { ...p, status: newStatus } : p));
      const successMsg =
        action === "advance"           ? "Proposal advanced."
        : action === "reject"          ? "Proposal rejected."
        : action === "request_revisions" ? "Revisions requested — the proponent has been notified."
        : "Proposal resubmitted for review.";
      toast.success(successMsg);
      setReviewNotes(""); setShowRejectForm(false); setShowReviseForm(false);
      // Reload detail so the new proposal_reviews row shows up in the history timeline.
      if (action === "request_revisions" || action === "resubmit") {
        const r = await fetch(`/api/proposals/${detail.id}`);
        if (r.ok) { const j2 = await r.json(); setDetail(j2.data); }
      }
    } else if (res.status === 422) {
      const j = await res.json().catch(() => ({}));
      if (Array.isArray(j.checks)) {
        // Pre-screening failure — update detail with the latest checks so the UI
        // can show which gates failed.
        setDetail((prev) => prev
          ? { ...prev, prescreening_checks: j.checks, prescreening_passed: false }
          : prev
        );
        toast.error(`${j.failedCount ?? 0} pre-screening check${j.failedCount === 1 ? "" : "s"} failed.`);
      } else {
        toast.error(j.error ?? "Action not allowed at this stage.");
      }
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Action failed.");
    }
    setAdvancing(false);
  }

  async function markFinanceCleared() {
    if (!detail) return;
    setAdvancing(true);
    const res = await fetch(`/api/proposals/${detail.id}/advance`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "mark_finance_cleared", finance_notes: reviewNotes.trim() || null }),
    });
    if (res.ok) {
      setDetail((prev) => prev
        ? { ...prev, finance_clearance: true, finance_cleared_at: new Date().toISOString(), finance_notes: reviewNotes.trim() || null }
        : prev
      );
      toast.success("Finance clearance recorded.");
      setReviewNotes("");
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to record finance clearance.");
    }
    setAdvancing(false);
  }

  // ── Counts ───────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return proposals.filter((p) => {
      const matchQ = p.title.toLowerCase().includes(q) || (p.barangays?.name ?? "").toLowerCase().includes(q);
      const matchS = statusFilter === "all" || p.status === statusFilter;
      const created = p.created_at.slice(0, 10);
      const matchFrom = !dateFrom || created >= dateFrom;
      const matchTo   = !dateTo   || created <= dateTo;
      return matchQ && matchS && matchFrom && matchTo;
    });
  }, [proposals, search, statusFilter, dateFrom, dateTo]);

  const counts = useMemo(() => ({
    total:    proposals.length,
    draft:    proposals.filter((p) => p.status === "draft").length,
    // "In Review" includes revisions_requested: those are still active work,
    // just waiting on the proponent rather than a reviewer.
    inReview: proposals.filter((p) => ["submitted","pre_screening","sdg_review","finance_review","revisions_requested"].includes(p.status)).length,
    approved: proposals.filter((p) => p.status === "approved").length,
    rejected: proposals.filter((p) => p.status === "rejected").length,
  }), [proposals]);

  // Phase rollup — buckets each proposal into one of the 4 active phase
  // groups from the PARAYA framework. Rejected proposals are excluded so the
  // breakdown reflects the live pipeline only.
  const phaseCounts = useMemo(() => {
    const buckets: Record<PhaseKey, number> = {
      diagnostic: 0, research: 0, filing: 0, execution: 0, closed: 0,
    };
    for (const p of proposals) {
      buckets[derivePhase(p).key] += 1;
    }
    const activeTotal =
      buckets.diagnostic + buckets.research + buckets.filing + buckets.execution;
    return { buckets, activeTotal };
  }, [proposals]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: "Total",      value: counts.total,    accent: "border-l-primary" },
          { label: "Draft",      value: counts.draft,    accent: "border-l-muted-foreground" },
          { label: "In Review",  value: counts.inReview, accent: "border-l-warning" },
          { label: "Approved",   value: counts.approved, accent: "border-l-success" },
          { label: "Rejected",   value: counts.rejected, accent: "border-l-danger" },
        ].map((c) => (
          <Card key={c.label} className={`border-border shadow-card border-l-4 ${c.accent}`}>
            <CardContent className="px-4 py-2.5">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold font-heading text-foreground mt-0.5">{loading ? "—" : c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline phase rollup — maps live proposals to the PARAYA Action
          Research Cycle phases so the Director can see where the work is
          concentrated. Rejected proposals are excluded from the bar. */}
      {!loading && phaseCounts.activeTotal > 0 && (
        <Card className="border-border shadow-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-heading text-sm font-semibold flex items-center gap-2">
                <Workflow className="w-4 h-4 text-primary" /> Pipeline Phase
              </p>
              <p className="text-xs text-muted-foreground">
                {phaseCounts.activeTotal} active initiative{phaseCounts.activeTotal !== 1 ? "s" : ""}
              </p>
            </div>
            {/* Stacked bar showing relative share per phase */}
            <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
              {(["diagnostic", "research", "filing", "execution"] as const).map((k) => {
                const n = phaseCounts.buckets[k];
                if (n === 0) return null;
                const pct = (n / phaseCounts.activeTotal) * 100;
                return (
                  <div
                    key={k}
                    className={PHASE_META[k].color}
                    style={{ width: `${pct}%` }}
                    title={`${PHASE_META[k].label}: ${n}`}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["diagnostic", "research", "filing", "execution"] as const).map((k) => {
                const meta = PHASE_META[k];
                return (
                  <div key={k} className="flex items-start gap-2 p-2 rounded-lg border border-border">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${meta.color}`} />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Phase {meta.range} · <span className="text-foreground font-medium">{meta.label}</span>
                      </p>
                      <p className="text-lg font-bold font-heading tabular-nums">{phaseCounts.buckets[k]}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proposals table */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading text-lg">Project Proposals</CardTitle>
              <div className="flex items-center gap-2">
                <ExportMenu
                  rows={filtered.map((p) => ({
                    Title:       p.title,
                    Barangay:    p.barangays?.name ?? "",
                    Status:      p.status,
                    Phase:       derivePhase(p).label,
                    "Budget (₱)": p.budget ?? 0,
                    "Start":     p.timeline_start ?? "",
                    "End":       p.timeline_end ?? "",
                    "SDGs":      (p.proposal_sdg_alignment ?? []).map((a) => a.sdg_number).join(", "),
                    "Community Validated": p.community_validated ? "yes" : "no",
                    "Created":   p.created_at,
                  }))}
                  filename="paraya-proposals"
                  sheetName="Proposals"
                />
                <Button onClick={openCreate} className="bg-primary hover:bg-primary-dark text-white gap-2">
                  <Plus className="w-4 h-4" /> New Proposal
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input placeholder="Search proposals…" className="pl-9 h-9 w-52 focus-visible:ring-primary/30" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9">
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="pre_screening">Pre-Screening</option>
                <option value="sdg_review">SDG Review</option>
                <option value="finance_review">Finance Review</option>
                <option value="revisions_requested">Revisions Requested</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" title="From date" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" title="To date" />
              {(search || statusFilter !== "all" || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Proposal</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Pipeline</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden lg:table-cell">Budget</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="py-3 px-4 w-10" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="py-16 text-center text-muted-foreground">
                    {proposals.length === 0 ? "No proposals yet. Click \"New Proposal\" to create one." : "No proposals match your filters."}
                  </td></tr>
                ) : filtered.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`border-b border-border/60 hover:bg-surface-alt/40 transition-colors cursor-pointer ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}
                    onClick={() => openDetail(p.id)}
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium text-foreground leading-snug">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.barangays ? p.barangays.name : "No barangay"} · {fmt(p.created_at)}
                      </p>
                      {(p.proposal_sdg_alignment ?? []).length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {p.proposal_sdg_alignment.map((a) => {
                            const sdg = SDG_META.find((s) => s.n === a.sdg_number);
                            return sdg ? (
                              <span key={a.sdg_number} className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: sdg.color }}>
                                SDG {a.sdg_number}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <PipelineStepper status={p.status} />
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{currency(p.budget)}</td>
                    <td className="py-3 px-4">
                      <Badge className={`${STATUS_BADGE[p.status]} capitalize text-xs`}>
                        {p.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuGroup>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openDetail(p.id)}>
                              <FileText className="w-3.5 h-3.5 mr-2" /> View Details
                            </DropdownMenuItem>
                            {(p.status === "draft" || p.status === "revisions_requested") && (
                              <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(p)}>
                                {p.status === "revisions_requested" ? "Edit Revision" : "Edit"}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && proposals.length > 0 && (
            <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">
              {filtered.length} of {proposals.length} proposals
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create / Edit Sheet ─────────────────────────────────────────────── */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
            <SheetTitle className="font-heading text-xl">
              {editProposal ? "Edit Proposal" : "New Project Proposal"}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {recommendationDraftContext && (
                <div className="rounded-xl border border-info/30 bg-info/5 p-4 text-sm" data-testid="recommendation-draft-prefill">
                  <p className="font-medium text-foreground">Advisory draft starter — not saved</p>
                  <p className="mt-1 text-muted-foreground">
                    {recommendationDraftContext.category} need · {recommendationDraftContext.barangayName} · evidence as of {recommendationDraftContext.asOfDate}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {recommendationDraftContext.suggestedCount === null
                      ? "No beneficiary count was prefilled because no unsuppressed approved aggregate count is available."
                      : `Suggested starting count: ${recommendationDraftContext.suggestedCount.toLocaleString("en-PH")} from ${recommendationDraftContext.cycleName ?? "an approved profiling aggregate"}.`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{recommendationDraftContext.limitation}</p>
                  <p className="mt-2 text-xs font-medium text-foreground">
                    Review and edit every field. No proposal exists until you choose Save Draft; this advisory never submits or advances it.
                  </p>
                  <p className="sr-only">
                    Recommendation {recommendationDraftContext.recommendationFingerprint}; need {recommendationDraftContext.needId}; evidence {recommendationDraftContext.evidenceSnapshotId ?? "unavailable"}.
                  </p>
                </div>
              )}

              {/* Basic info */}
              <div className="space-y-4">
                <p className="text-muted-foreground font-medium">Project Details</p>
                <div className="space-y-1.5">
                  <Label htmlFor="title">Title <span className="text-danger">*</span></Label>
                  <Input id="title" placeholder="e.g. Literacy Drive for Barangay Sta. Ana" className="focus-visible:ring-primary/30" {...register("title")} />
                  {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rationale">Rationale <span className="text-danger">*</span></Label>
                  <Textarea id="rationale" rows={3} placeholder="Why is this project needed? What problem does it address?" className="focus-visible:ring-primary/30 resize-none" {...register("rationale")} />
                  {errors.rationale && <p className="text-xs text-danger">{errors.rationale.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="objectives">Objectives</Label>
                  <Textarea id="objectives" rows={2} placeholder="List the key objectives of the project…" className="focus-visible:ring-primary/30 resize-none" {...register("objectives")} />
                </div>
              </div>

              <Separator />

              {/* Beneficiaries */}
              <div className="space-y-4">
                <p className="text-muted-foreground font-medium">Beneficiaries & Output</p>
                <div className="space-y-1.5">
                  <Label htmlFor="target_beneficiaries">Target beneficiaries</Label>
                  <Input id="target_beneficiaries" placeholder="e.g. 200 out-of-school youth in Barangay Sta. Ana" className="focus-visible:ring-primary/30" {...register("target_beneficiaries")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expected_beneficiary_count">Expected beneficiary count</Label>
                  <Input id="expected_beneficiary_count" type="number" min="0" step="1" placeholder="Use an approved aggregate or documented estimate" className="focus-visible:ring-primary/30" {...register("expected_beneficiary_count")} />
                  <p className="text-xs text-muted-foreground">Use a completed profiling aggregate when available; otherwise document the manual source during structured review.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expected_output">Expected output</Label>
                  <Textarea id="expected_output" rows={2} placeholder="What will be produced or achieved?" className="focus-visible:ring-primary/30 resize-none" {...register("expected_output")} />
                </div>
              </div>

              <Separator />

              {/* Timeline + Budget + Barangay */}
              <div className="space-y-4">
                <p className="text-muted-foreground font-medium">Timeline, Budget & Location</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="timeline_start">Start date</Label>
                    <Input id="timeline_start" type="date" className="focus-visible:ring-primary/30" {...register("timeline_start")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="timeline_end">End date</Label>
                    <Input id="timeline_end" type="date" className="focus-visible:ring-primary/30" {...register("timeline_end")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="budget">Estimated budget (₱)</Label>
                  <Input id="budget" type="number" min="0" step="100" placeholder="0.00" className="focus-visible:ring-primary/30" {...register("budget")} />
                </div>

                {/* Income-generating gate */}
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-1.5">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-warning/40 text-warning focus:ring-warning/30 cursor-pointer"
                      {...register("is_income_generating")}
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-foreground">This project will generate income.</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        PARAYA only funds non-income-generating community service projects. Check this only if the project produces revenue (e.g., fee-based services).
                      </span>
                    </span>
                  </label>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="barangay_id">Barangay</Label>
                  <select id="barangay_id" {...register("barangay_id")} className="w-full h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none">
                    <option value="">— No specific barangay —</option>
                    {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <Separator />

              {/* SDG alignment */}
              <div className="space-y-4">
                <p className="text-muted-foreground font-medium">SDG Alignment</p>
                <p className="text-xs text-muted-foreground">Select all applicable UN Sustainable Development Goals.</p>
                <div className="grid grid-cols-2 gap-2">
                  {SDG_META.map((sdg) => {
                    const selected = sdgSelected.includes(sdg.n);
                    return (
                      <button
                        key={sdg.n}
                        type="button"
                        onClick={() => toggleSdg(sdg.n)}
                        className={`p-3 rounded-xl border text-left transition-all ${selected ? "ring-2 ring-offset-1" : "border-border hover:border-primary/30"}`}
                        style={selected ? { borderColor: sdg.color } : {}}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: sdg.color }}>SDG {sdg.n}</span>
                          {selected && <CheckCircle className="w-3.5 h-3.5 ml-auto" style={{ color: sdg.color }} />}
                        </div>
                        <p className="text-xs text-foreground font-medium mt-1">{sdg.label}</p>
                      </button>
                    );
                  })}
                </div>
                {sdgSelected.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Specific indicators for selected SDGs:</p>
                    {sdgSelected.map((n) => {
                      const sdg = SDG_META.find((s) => s.n === n)!;
                      return (
                        <div key={n} className="space-y-1">
                          <label className="text-xs font-medium text-foreground">SDG {n} — {sdg.label}</label>
                          <Input
                            placeholder="e.g. Increase literacy rate by 15%"
                            value={sdgIndicators[n] ?? ""}
                            onChange={(e) => setSdgIndicators((prev) => ({ ...prev, [n]: e.target.value }))}
                            className="h-8 text-xs focus-visible:ring-primary/30"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Card className="border-primary/20 bg-primary/5 shadow-none">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 font-heading text-base">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Advisory alignment check
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Shows separate evidence-based planning dimensions without saving or advancing this proposal.
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={runAlignmentCheck}>
                      Check this draft
                    </Button>
                  </div>
                </CardHeader>
                {alignment && (
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={alignment.overall === "recommended" ? "secondary" : "outline"}>
                        {alignment.overallLabel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Advisory only · run again after editing</span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{alignment.summary}</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {alignment.dimensions.map((dimension) => (
                        <div key={dimension.code} className="flex items-start gap-2 rounded-md border border-border bg-background/70 p-2.5">
                          {dimension.rating === "strong" || dimension.rating === "moderate"
                            ? <CheckCircle className="mt-0.5 h-4 w-4 flex-none text-success" />
                            : <CircleAlert className="mt-0.5 h-4 w-4 flex-none text-warning" />}
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-medium text-foreground">{dimension.label}</p>
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {dimension.rating.replaceAll("_", " ")}
                              </Badge>
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">{dimension.finding}</p>
                            {dimension.action && (
                              <p className="text-xs leading-relaxed text-foreground"><span className="font-medium">Next:</span> {dimension.action}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {alignment.limitations.join(" ")}
                    </p>
                  </CardContent>
                )}
              </Card>

              {/* Builds on prior proposals — Phase VIII → Phase I feedback loop.
                  Lets the proponent cite the cycle(s) this new initiative
                  builds on, surfacing the lessons-learned chain explicitly. */}
              <div className="space-y-2">
                <Label className="text-foreground font-medium">
                  Builds on prior proposals <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Cite prior cycles this proposal extends or refines. Approved and rejected
                  past initiatives both qualify — both encode lessons learned.
                </p>
                <div className="max-h-44 overflow-y-auto scrollbar-thin border border-border rounded-xl divide-y divide-border bg-card">
                  {proposals
                    .filter((p) => p.id !== editProposal?.id)
                    .filter((p) => ["approved", "rejected"].includes(p.status))
                    .slice(0, 30)
                    .map((p) => {
                      const checked = informedBy.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setInformedBy((cur) =>
                                cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]
                              )
                            }
                            className="rounded border-border"
                          />
                          <span className="flex-1 min-w-0 truncate">{p.title}</span>
                          <Badge className={`${STATUS_BADGE[p.status]} capitalize text-[10px] px-1.5 py-0`}>
                            {p.status.replace("_", " ")}
                          </Badge>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {new Date(p.created_at).getFullYear()}
                          </span>
                        </label>
                      );
                    })}
                  {proposals.filter((p) => p.id !== editProposal?.id && ["approved","rejected"].includes(p.status)).length === 0 && (
                    <p className="text-xs text-muted-foreground italic px-3 py-3">
                      No prior approved or rejected proposals yet.
                    </p>
                  )}
                </div>
                {informedBy.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {informedBy.length} prior proposal{informedBy.length === 1 ? "" : "s"} linked
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-border px-6 py-4 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark text-white">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {editProposal ? "Save Changes" : "Create Proposal"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Detail / Review Sheet ───────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
            <SheetTitle className="font-heading text-lg leading-snug">
              {detail?.title ?? "Proposal Details"}
            </SheetTitle>
            {detail && (
              <Badge className={`${STATUS_BADGE[detail.status]} capitalize text-xs mt-1 self-start`}>
                {detail.status.replace("_", " ")}
              </Badge>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {detailLoading ? (
              <div className="py-20 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
              </div>
            ) : detail ? (
              <>
                {/* Pipeline + PPF print link */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-muted-foreground font-medium">Approval Pipeline</p>
                    <button
                      type="button"
                      onClick={() => window.open(`/officer/proposals/${detail.id}/ppf`, "_blank")}
                      className="inline-flex items-center gap-1.5 text-xs h-7 px-2.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5"
                      title="Open the Project Participation Form for printing"
                    >
                      <Printer className="w-3.5 h-3.5" /> Project Participation Form
                    </button>
                  </div>
                  <PipelineStepper status={detail.status} />
                </div>

                <Separator />

                {/* Proposal fields */}
                <div className="space-y-4 text-sm">
                  {[
                    { label: "Rationale",            value: detail.rationale },
                    { label: "Objectives",            value: detail.objectives },
                    { label: "Target Beneficiaries",  value: detail.target_beneficiaries },
                    { label: "Expected Count",         value: detail.expected_beneficiary_count != null ? detail.expected_beneficiary_count.toLocaleString("en-PH") : null },
                    { label: "Expected Output",       value: detail.expected_output },
                  ].map(({ label, value }) => value ? (
                    <div key={label}>
                      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                      <p className="text-foreground mt-0.5 whitespace-pre-wrap">{value}</p>
                    </div>
                  ) : null)}

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">Timeline</p>
                      <p className="text-foreground mt-0.5">{fmt(detail.timeline_start)} — {fmt(detail.timeline_end)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">Budget</p>
                      <p className="text-foreground mt-0.5">{currency(detail.budget)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">Barangay</p>
                      <p className="text-foreground mt-0.5">{detail.barangays?.name ?? "—"}</p>
                    </div>
                  </div>

                  {(detail.proposal_sdg_alignment ?? []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">SDG Alignment</p>
                      <div className="flex flex-wrap gap-2">
                        {detail.proposal_sdg_alignment.map((a) => {
                          const sdg = SDG_META.find((s) => s.n === a.sdg_number)!;
                          return (
                            <div key={a.sdg_number} className="rounded-lg p-2 text-xs" style={{ backgroundColor: `${sdg.color}18`, border: `1px solid ${sdg.color}40` }}>
                              <span className="font-bold" style={{ color: sdg.color }}>SDG {a.sdg_number}</span>
                              <span className="text-muted-foreground ml-1">{sdg.label}</span>
                              {a.indicator && <p className="text-foreground mt-0.5 italic">{a.indicator}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Builds on — shows the prior proposal(s) this one cites */}
                {(detail.informed_by_proposals ?? []).length > 0 && (() => {
                  const linked = proposals.filter((p) => detail.informed_by_proposals?.includes(p.id));
                  if (linked.length === 0) return null;
                  return (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-muted-foreground font-medium text-sm flex items-center gap-2">
                          <History className="w-4 h-4" /> Builds on
                        </p>
                        <div className="space-y-1.5">
                          {linked.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setDetailOpen(false); setTimeout(() => openDetail(p.id), 80); }}
                              className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/40 text-left text-sm transition-colors"
                            >
                              <span className="flex-1 min-w-0 truncate text-foreground">{p.title}</span>
                              <Badge className={`${STATUS_BADGE[p.status]} capitalize text-[10px] px-1.5 py-0`}>
                                {p.status.replace("_", " ")}
                              </Badge>
                              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                                {new Date(p.created_at).getFullYear()}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* Review history */}
                {(detail.proposal_reviews ?? []).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <p className="text-muted-foreground font-medium">Review History</p>
                      {detail.proposal_reviews.map((r) => {
                        const badgeClass =
                          r.decision === "approved"            ? "bg-success/10 text-success border-success/20"
                          : r.decision === "revisions_requested" ? "bg-accent/15 text-accent-foreground border-accent/30"
                          : r.decision === "resubmitted"       ? "bg-info/10 text-info border-info/20"
                          :                                       "bg-danger/10 text-danger border-danger/20";
                        return (
                        <div key={r.id} className="p-3 rounded-xl border border-border bg-transparent-alt/30 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground capitalize">{r.stage.replace("_", " ")}</span>
                            <Badge className={`${badgeClass} border text-xs`}>
                              {r.decision.replace("_", " ")}
                            </Badge>
                          </div>
                          {r.notes && <p className="text-muted-foreground mt-1 text-xs">{r.notes}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            {r.users?.full_name ?? "Officer"} · {fmt(r.reviewed_at)}
                          </p>
                        </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Pre-screening result (if recorded) */}
                {Array.isArray(detail.prescreening_checks) && detail.prescreening_checks.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-muted-foreground font-medium">Pre-Screening Result</p>
                        <Badge className={detail.prescreening_passed
                          ? "bg-success/10 text-success border-success/20 border text-xs"
                          : "bg-danger/10 text-danger border-danger/20 border text-xs"
                        }>
                          {detail.prescreening_passed ? "Passed" : "Failed"}
                        </Badge>
                      </div>
                      <ul className="space-y-1.5">
                        {detail.prescreening_checks.map((c) => (
                          <li key={c.name} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${c.passed ? "bg-success/5" : "bg-danger/5"}`}>
                            <span className={`mt-0.5 flex-shrink-0 ${c.passed ? "text-success" : "text-danger"}`}>
                              {c.passed ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground">{c.name}</p>
                              <p className="text-muted-foreground mt-0.5 leading-relaxed">{c.message}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {/* Community Validation (Phase II) — evidence-backed.
                    The DB trigger flips detail.community_validated to TRUE
                    when either path is satisfied:
                      * Primary: ≥ 2 linked records, ≥ 1 approved community_need
                      * Supplementary: validation event with ≥ 1 file + ≥ 3 stakeholders
                    Pre-screening reads that derived flag. */}
                <>
                  <Separator />
                  <CommunityValidationSection
                    proposalId={detail.id}
                    proposalStatus={detail.status}
                    validatedFlag={detail.community_validated}
                    proposalBarangayId={detail.barangay_id}
                    onChange={() => openDetail(detail.id)}
                  />
                </>

                {/* Finance clearance status (if in finance_review and already cleared) */}
                {detail.status === "finance_review" && detail.finance_clearance && (
                  <>
                    <Separator />
                    <div className="p-3 rounded-xl bg-success/5 border border-success/20 space-y-1">
                      <div className="flex items-center gap-2 text-success">
                        <CheckCircle className="w-4 h-4" />
                        <p className="text-sm font-medium">Finance Office cleared</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Recorded {fmt(detail.finance_cleared_at)}.
                        {detail.finance_notes && <span className="block mt-1">Notes: {detail.finance_notes}</span>}
                      </p>
                    </div>
                  </>
                )}

                {/* Revisions-requested banner: surface the latest reviewer notes so the
                    proponent sees exactly what to change. */}
                {detail.status === "revisions_requested" && (() => {
                  const latest = [...(detail.proposal_reviews ?? [])]
                    .filter((r) => r.decision === "revisions_requested")
                    .sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime())[0];
                  return (
                    <>
                      <Separator />
                      <div className="p-3 rounded-xl bg-accent/10 border border-accent/30 space-y-1">
                        <div className="flex items-center gap-2 text-accent-foreground">
                          <RotateCcw className="w-4 h-4" />
                          <p className="text-sm font-medium">Revisions requested</p>
                          {(detail.revision_count ?? 0) > 0 && (
                            <Badge className="bg-muted text-muted-foreground border text-xs ml-auto">
                              Round {(detail.revision_count ?? 0) + 1}
                            </Badge>
                          )}
                        </div>
                        {latest?.notes && (
                          <p className="text-xs text-muted-foreground whitespace-pre-line">{latest.notes}</p>
                        )}
                        {latest && (
                          <p className="text-xs text-muted-foreground">
                            {latest.users?.full_name ?? "Reviewer"} · {fmt(latest.reviewed_at)} · sent back from{" "}
                            <span className="capitalize">{(detail.revision_requested_from ?? latest.stage).replace("_", " ")}</span>
                          </p>
                        )}
                      </div>
                    </>
                  );
                })()}

                {/* Approved proposals: offer a one-click handoff into the
                    Programs module with the proposal's fields pre-filled. */}
                {detail.status === "approved" && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <p className="text-muted-foreground font-medium">Next step</p>
                      <Button
                        onClick={() => {
                          setDetailOpen(false);
                          router.push(`/officer/programs?fromProposal=${detail.id}`);
                        }}
                        className="w-full bg-primary hover:bg-primary-dark text-white gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Create Program from Proposal
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Opens the New Program form with this proposal&apos;s title, barangay, timeline, and budget pre-filled.
                      </p>
                    </div>
                  </>
                )}

                {/* Actions — three modes: resubmit (when revisions_requested),
                    review (advance/revise/reject), or hidden (approved/rejected). */}
                {(ADVANCE_LABEL[detail.status] || detail.status === "revisions_requested") && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <p className="text-muted-foreground font-medium">Actions</p>

                      {detail.status === "revisions_requested" ? (
                        <div className="space-y-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Resubmission notes (optional)</Label>
                            <Textarea
                              rows={2}
                              placeholder="Summarize what you changed in this revision…"
                              className="focus-visible:ring-primary/30 resize-none text-sm"
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                            />
                          </div>
                          <Button
                            disabled={advancing}
                            onClick={() => advance("resubmit")}
                            className="w-full bg-primary hover:bg-primary-dark text-white gap-2"
                          >
                            {advancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Resubmit for Review
                          </Button>
                        </div>
                      ) : showRejectForm ? (
                        <div className="space-y-2">
                          <Label className="text-xs text-danger">Rejection reason <span className="text-danger">*</span></Label>
                          <Textarea
                            rows={3}
                            placeholder="Explain why this proposal is being rejected…"
                            className="focus-visible:ring-danger/30 border-danger/30 resize-none text-sm"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => { setShowRejectForm(false); setReviewNotes(""); }} className="flex-1">
                              Cancel
                            </Button>
                            <Button disabled={advancing} onClick={() => advance("reject")} className="flex-1 bg-danger hover:bg-danger/90 text-white">
                              {advancing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                              Confirm Rejection
                            </Button>
                          </div>
                        </div>
                      ) : showReviseForm ? (
                        <div className="space-y-2">
                          <Label className="text-xs text-accent-foreground">
                            What needs to change? <span className="text-danger">*</span>
                          </Label>
                          <Textarea
                            rows={3}
                            placeholder="Describe what the proponent should revise…"
                            className="focus-visible:ring-accent/30 border-accent/40 resize-none text-sm"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => { setShowReviseForm(false); setReviewNotes(""); }} className="flex-1">
                              Cancel
                            </Button>
                            <Button disabled={advancing} onClick={() => advance("request_revisions")} className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground">
                              {advancing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                              Send Back for Revisions
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">
                              {detail.status === "finance_review" && !detail.finance_clearance
                                ? "Finance clearance notes"
                                : "Review notes (optional for advance)"}
                            </Label>
                            <Textarea
                              rows={2}
                              placeholder="Add notes for this review stage…"
                              className="focus-visible:ring-primary/30 resize-none text-sm"
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                            />
                          </div>
                          {/* In finance_review without clearance, force the Mark Finance Cleared step */}
                          {detail.status === "finance_review" && !detail.finance_clearance ? (
                            <div className="flex gap-2">
                              <Button
                                disabled={advancing}
                                onClick={markFinanceCleared}
                                className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
                              >
                                {advancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Mark Finance Cleared
                              </Button>
                              {/* Request revisions is only valid in actual review stages, not draft */}
                              <Button
                                variant="outline"
                                disabled={advancing}
                                onClick={() => setShowReviseForm(true)}
                                className="border-accent/40 text-accent-foreground hover:bg-accent/5"
                                title="Send back for revisions"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                disabled={advancing}
                                onClick={() => setShowRejectForm(true)}
                                className="border-danger/40 text-danger hover:bg-danger/5"
                                title="Reject"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                disabled={advancing}
                                onClick={() => advance("advance")}
                                className="flex-1 bg-primary hover:bg-primary-dark text-white gap-2"
                              >
                                {advancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {ADVANCE_LABEL[detail.status]}
                              </Button>
                              {/* Request revisions is only valid in actual review stages, not draft */}
                              {detail.status !== "draft" && (
                                <Button
                                  variant="outline"
                                  disabled={advancing}
                                  onClick={() => setShowReviseForm(true)}
                                  className="border-accent/40 text-accent-foreground hover:bg-accent/5"
                                  title="Send back for revisions"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                disabled={advancing}
                                onClick={() => setShowRejectForm(true)}
                                className="border-danger/40 text-danger hover:bg-danger/5"
                                title="Reject"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="text-center text-muted-foreground py-10">Failed to load details.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
