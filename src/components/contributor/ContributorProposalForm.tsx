"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { hasCapability } from "@/lib/auth/capabilities";
import { FOCUS_SDG_NUMBERS } from "@/lib/sdg-focus.js";
import { SDG_COLORS, SDG_LABELS } from "@/lib/constants";
import { proposalDraftGraphSchema, type ProposalDraftGraphInput } from "@/lib/phase2/contracts";
import type { ProposalAssistResult, ProposalReview } from "@/lib/ai/proposal-assist";
import { phase2Api, jsonRequest } from "@/components/phase2/Phase2Ui";
import { ProposalDraftEditor } from "@/components/phase2/ProposalDraftEditor";
import type { EditableProposalDetail } from "@/components/phase2/evidence-editing";
import { loadContributorCatalog, peso } from "./ContributorUi";

export type ContributorCatalog = {
  partners: Array<{ id: string; code: string; name: string; type: string }>;
  responsibleOfficers: Array<{ id: string; name: string; role: string }>;
  projectCategories: Array<{ id: string; code: string; label: string }>;
  beneficiaryCategories: Array<{ code: string; label: string; planningCubeAvailable: boolean }>;
  budgetCategories: Array<{ id: string; code: string; label: string }>;
  barangays: Array<{ id: string; name: string; sitios: Array<{ id: string; name: string }> }>;
  approvedNeeds: Array<{ id: string; barangayId: string; title: string; category: string; priority: number }>;
  sdgs: Array<{ number: number; label: string }>;
};

type BudgetLine = { key: number; categoryId: string; kind: "cash" | "in_kind"; description: string; quantity: string; unit: string; unitCost: string; value: string };

type FormState = {
  title: string; description: string; partnerId: string; projectCategoryId: string; startsOn: string; endsOn: string;
  barangayId: string; sitioId: string; needId: string; coverage: "partial" | "full";
  beneficiaryCategory: string; beneficiaryCount: string; beneficiarySource: string;
  /** Kept only when editing a proposal whose count came from approved profiling evidence. */
  evidence: { snapshotId: string; overrideReason: string | null; summary: string } | null;
  sdgs: number[]; zeroCash: boolean; zeroCashJustification: string; lines: BudgetLine[];
};

// The server replaces this with an active PARAYA Officer; Contributors never choose a reviewer.
const SERVER_ASSIGNED_OFFICER = "00000000-0000-0000-0000-000000000000";
const fieldClass = "h-9 w-full rounded-lg border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50";

let lineKey = 0;
const newLine = (categoryId = ""): BudgetLine => ({ key: ++lineKey, categoryId, kind: "cash", description: "", quantity: "1", unit: "lot", unitCost: "", value: "" });

function money(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
const decimal = (value: number) => value.toFixed(2);

function lineAmount(line: BudgetLine): number {
  return line.kind === "cash" ? money(line.quantity) * money(line.unitCost) : money(line.value);
}

/** True when the proposal has more structure than this form edits (several targets, needs, or estimates). */
export function needsFullEditor(detail: EditableProposalDetail): boolean {
  return detail.targets.length > 1 || detail.needs.length > 1 || detail.beneficiaryEstimates.length > 1;
}

function stateFromDetail(detail: EditableProposalDetail): FormState {
  const lead = detail.targets.find((target) => target.isLead) ?? detail.targets[0];
  const need = detail.needs[0];
  const estimate = detail.beneficiaryEstimates[0];
  return {
    title: detail.title, description: detail.description, partnerId: detail.originatingPartnerId ?? "",
    projectCategoryId: detail.projectCategoryId, startsOn: detail.startsOn, endsOn: detail.endsOn,
    barangayId: lead?.barangayId ?? "", sitioId: lead?.sitioId ?? "", needId: need?.needId ?? "", coverage: need?.coverage ?? "partial",
    beneficiaryCategory: estimate?.categoryCode ?? "", beneficiaryCount: estimate ? String(estimate.finalCount) : "",
    beneficiarySource: estimate && !estimate.evidenceSnapshotId ? estimate.sourceDescription ?? "" : "",
    evidence: estimate?.evidenceSnapshotId ? { snapshotId: estimate.evidenceSnapshotId, overrideReason: estimate.overrideReason, summary: estimate.sourceDescription ?? "Approved profiling evidence" } : null,
    sdgs: detail.sdgs.map((sdg) => sdg.number),
    zeroCash: detail.budget?.zeroCash ?? false, zeroCashJustification: detail.budget?.zeroCashJustification ?? "",
    lines: (detail.budget?.items ?? []).map((item) => ({
      key: ++lineKey, categoryId: item.categoryId, kind: item.kind, description: item.description, quantity: item.quantity,
      unit: item.unit, unitCost: item.kind === "cash" ? item.unitCost : "", value: item.kind === "in_kind" ? item.inKindValuation ?? "" : "",
    })),
  };
}

function emptyState(catalog: ContributorCatalog | null): FormState {
  return {
    title: "", description: "", partnerId: catalog?.partners.length === 1 ? catalog.partners[0].id : "", projectCategoryId: "",
    startsOn: "", endsOn: "", barangayId: "", sitioId: "", needId: "", coverage: "partial",
    beneficiaryCategory: "", beneficiaryCount: "", beneficiarySource: "", evidence: null,
    sdgs: [], zeroCash: false, zeroCashJustification: "", lines: [newLine()],
  };
}

function buildGraph(form: FormState, editing: EditableProposalDetail | null): ProposalDraftGraphInput | { issues: string[] } {
  const count = Number(form.beneficiaryCount);
  const targetAreaKey = `${form.barangayId}:${form.sitioId || "all"}`;
  const cashTotal = form.lines.filter((line) => line.kind === "cash").reduce((sum, line) => sum + lineAmount(line), 0);
  const inKindTotal = form.lines.filter((line) => line.kind === "in_kind").reduce((sum, line) => sum + lineAmount(line), 0);
  const fundingSources: ProposalDraftGraphInput["fundingSources"] = [];
  if (cashTotal > 0) fundingSources.push({ type: "internal_dyci", state: "expected", partnerId: null, cashValue: decimal(cashTotal), inKindValue: "0.00", notes: null });
  if (inKindTotal > 0) fundingSources.push({ type: "in_kind_donation", state: "expected", partnerId: null, cashValue: "0.00", inKindValue: decimal(inKindTotal), notes: null });
  const candidate = {
    title: form.title, description: form.description, originChannel: "partner_document" as const,
    originatingPartnerId: form.partnerId || null, responsibleOfficerId: editing?.responsibleOfficerId ?? SERVER_ASSIGNED_OFFICER,
    projectCategoryId: form.projectCategoryId, startsOn: form.startsOn, endsOn: form.endsOn,
    targets: [{ barangayId: form.barangayId, sitioId: form.sitioId || null, isLead: true }],
    needs: [{ needId: form.needId, targetAreaKey, intendedCoverage: form.coverage, plannedBeneficiaryCount: Number.isInteger(count) && count > 0 ? count : null, plannedBeneficiaryPercentage: null, notes: null }],
    beneficiaryCategoryCodes: [form.beneficiaryCategory], finalBeneficiaryCount: count,
    beneficiarySourceDescription: form.evidence ? form.evidence.summary.slice(0, 500) : form.beneficiarySource.trim(),
    beneficiaryEstimates: [{
      categoryCode: form.beneficiaryCategory, targetAreaKey, finalCount: count,
      evidenceSnapshotId: form.evidence?.snapshotId ?? null,
      manualSourceDescription: form.evidence ? null : form.beneficiarySource.trim(),
      overrideReason: form.evidence?.overrideReason ?? null,
    }],
    sdgNumbers: form.sdgs, zeroCash: form.zeroCash, zeroCashJustification: form.zeroCash ? form.zeroCashJustification.trim() : null,
    budgetItems: form.lines.map((line, index) => ({
      categoryId: line.categoryId, kind: line.kind, description: line.description, quantity: line.quantity || "1", unit: line.unit || "lot",
      unitCost: line.kind === "cash" ? decimal(money(line.unitCost)) : "0.00",
      inKindValuation: line.kind === "in_kind" ? decimal(money(line.value)) : null, notes: null, sortOrder: index,
    })),
    fundingSources,
    ...(editing ? { expectedVersion: editing.rowVersion } : {}),
  };
  const issues: string[] = [];
  if (!candidate.originatingPartnerId) issues.push("Choose your proponent organization.");
  if (!candidate.projectCategoryId) issues.push("Choose a project category.");
  if (!form.barangayId) issues.push("Choose the target barangay.");
  if (!form.needId) issues.push("Choose the approved community need this project addresses.");
  if (!form.beneficiaryCategory) issues.push("Choose the beneficiary group.");
  if (!Number.isInteger(count) || count <= 0) issues.push("Enter the planned number of beneficiaries.");
  if (!form.evidence && form.beneficiarySource.trim().length < 10) issues.push("Explain where the beneficiary count comes from (at least 10 characters).");
  if (form.sdgs.length === 0) issues.push("Select at least one SDG.");
  if (form.lines.some((line) => !line.categoryId || !line.description.trim())) issues.push("Give every budget line a category and description.");
  if (form.zeroCash && !form.zeroCashJustification.trim()) issues.push("Explain why the project needs no cash.");
  if (issues.length) return { issues };
  const parsed = proposalDraftGraphSchema.safeParse(candidate);
  if (!parsed.success) return { issues: parsed.error.issues.map((issue) => issue.message) };
  return parsed.data;
}

export function ContributorProposalForm({ open, onOpenChange, editing, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: EditableProposalDetail | null;
  onSaved: (id: string, created: boolean) => void;
}) {
  const { role, permissions } = useDashboardActor();
  const canUseAI = hasCapability(role, permissions, "ai.assist");
  const [catalog, setCatalog] = useState<ContributorCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => (editing ? stateFromDetail(editing) : emptyState(null)));
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [assisting, setAssisting] = useState<string | null>(null);
  const [descriptionSuggestion, setDescriptionSuggestion] = useState<string | null>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [review, setReview] = useState<ProposalReview | null>(null);
  const fullEditor = editing ? needsFullEditor(editing) : false;

  useEffect(() => {
    let active = true;
    loadContributorCatalog()
      .then((data) => {
        if (!active) return;
        setCatalog(data);
        if (!editing) setForm((current) => (current.partnerId || data.partners.length !== 1 ? current : { ...current, partnerId: data.partners[0].id }));
      })
      .catch((error) => active && setCatalogError(error instanceof Error ? error.message : "The proposal form could not be loaded."));
    return () => { active = false; };
  }, [editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setLine = (key: number, patch: Partial<BudgetLine>) => setForm((current) => ({ ...current, lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) }));

  const barangay = catalog?.barangays.find((row) => row.id === form.barangayId);
  const needs = useMemo(() => catalog?.approvedNeeds.filter((need) => need.barangayId === form.barangayId) ?? [], [catalog, form.barangayId]);
  const cashTotal = form.lines.filter((line) => line.kind === "cash").reduce((sum, line) => sum + lineAmount(line), 0);
  const inKindTotal = form.lines.filter((line) => line.kind === "in_kind").reduce((sum, line) => sum + lineAmount(line), 0);

  function assistDraft() {
    const label = <T extends { id: string }>(rows: T[] | undefined, id: string, pick: (row: T) => string) => {
      const row = rows?.find((candidate) => candidate.id === id);
      return row ? pick(row) : "";
    };
    const count = Number(form.beneficiaryCount);
    return {
      title: form.title, description: form.description,
      organization: label(catalog?.partners, form.partnerId, (row) => row.name),
      category: label(catalog?.projectCategories, form.projectCategoryId, (row) => row.label),
      barangay: barangay?.name ?? "", sitio: barangay?.sitios.find((row) => row.id === form.sitioId)?.name ?? "",
      need: needs.find((row) => row.id === form.needId)?.title ?? "",
      beneficiaryCategory: catalog?.beneficiaryCategories.find((row) => row.code === form.beneficiaryCategory)?.label ?? "",
      beneficiaryCount: Number.isInteger(count) && count > 0 ? count : null,
      startsOn: form.startsOn, endsOn: form.endsOn, sdgs: form.sdgs, zeroCash: form.zeroCash,
      budgetLines: form.lines.filter((line) => line.description.trim()).map((line) => ({ description: line.description.trim(), kind: line.kind, amount: lineAmount(line) })),
    };
  }

  async function runAssist(task: "draft_description" | "improve_description" | "suggest_titles" | "review") {
    setAssisting(task);
    try {
      const response = await fetch("/api/ai/proposal-assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, draft: assistDraft() }) });
      const body = await response.json().catch(() => null) as { data?: ProposalAssistResult; error?: string } | null;
      if (!response.ok || !body?.data) throw new Error(body?.error ?? "The AI could not answer this time.");
      const result = body.data;
      if (result.task === "suggest_titles") setTitleSuggestions(result.titles);
      else if (result.task === "review") setReview(result.review);
      else setDescriptionSuggestion(result.text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The AI could not answer this time.");
    } finally {
      setAssisting(null);
    }
  }

  async function save(draft: ProposalDraftGraphInput): Promise<boolean> {
    setSaving(true);
    try {
      if (editing) {
        await phase2Api(`/api/v2/proposals/${editing.id}`, jsonRequest("PATCH", { ...draft, expectedVersion: editing.rowVersion }));
        toast.success("Changes saved. Submit the proposal when it is ready for review.");
        onSaved(editing.id, false);
      } else {
        const created = await phase2Api<{ id: string }>("/api/v2/proposals", jsonRequest("POST", draft));
        toast.success("Draft saved. Review it, then submit it to PARAYA.");
        onSaved(created.id, true);
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The proposal could not be saved.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const graph = buildGraph(form, editing);
    if ("issues" in graph) { setIssues(graph.issues); return; }
    setIssues([]);
    await save(graph);
  }

  const aiButton = (task: "draft_description" | "improve_description" | "suggest_titles" | "review", label: string, Icon = Sparkles) => (
    <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/5" disabled={assisting !== null || !catalog} onClick={() => void runAssist(task)}>
      {assisting === task ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />} {label}
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
          <SheetTitle className="font-heading text-xl">{editing ? (editing.status === "revisions_requested" ? "Revise Proposal" : "Edit Proposal") : "New Project Proposal"}</SheetTitle>
          <p className="text-sm text-muted-foreground">Saving keeps the proposal as a draft. You submit it to PARAYA separately, and a PARAYA Officer reviews and decides.</p>
        </SheetHeader>

        {catalogError ? (
          <div role="alert" className="p-6 text-sm text-danger">{catalogError}</div>
        ) : !catalog ? (
          <div className="py-20 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading form…</div>
        ) : catalog.partners.length === 0 && !editing ? (
          <div role="alert" className="m-6 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
            Your account is not linked to a DYCI office, student organization, or academic department yet. Ask the System Administrator to link your organization before creating a proposal.
          </div>
        ) : editing && fullEditor ? (
          <div data-sheet-scroll-region className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 sm:px-6 py-5">
            <p className="mb-4 rounded-xl border border-info/30 bg-info/5 p-3 text-sm text-muted-foreground">This proposal has several target areas or estimates, so it opens in the detailed editor.</p>
            <ProposalDraftEditor initial={editing} catalog={catalog} busy={saving} onSave={save} onCancel={() => onOpenChange(false)} />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
            <div data-sheet-scroll-region className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-4 sm:px-6 py-5 space-y-6">
              {editing?.status === "revisions_requested" && (
                <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">Address the Officer&apos;s remarks shown on the proposal, save your changes, then resubmit.</div>
              )}

              {/* Project details */}
              <section className="space-y-4">
                <p className="text-muted-foreground font-medium">Project Details</p>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-partner">Proponent organization <span className="text-danger">*</span></Label>
                    <select id="cp-partner" className={fieldClass} value={form.partnerId} onChange={(event) => set("partnerId", event.target.value)}>
                      <option value="">Choose your organization</option>
                      {catalog.partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-category">Project category <span className="text-danger">*</span></Label>
                    <select id="cp-category" className={fieldClass} value={form.projectCategoryId} onChange={(event) => set("projectCategoryId", event.target.value)}>
                      <option value="">Choose a category</option>
                      {catalog.projectCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="cp-title">Title <span className="text-danger">*</span></Label>
                    {canUseAI && aiButton("suggest_titles", "Suggest titles", Wand2)}
                  </div>
                  <Input id="cp-title" value={form.title} maxLength={160} placeholder="e.g. Digital Literacy Workshop for Barangay Biñang 2nd" className="focus-visible:ring-primary/30" onChange={(event) => set("title", event.target.value)} />
                  {titleSuggestions.length > 0 && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2" data-testid="ai-title-suggestions">
                      <div className="flex items-center justify-between"><p className="text-xs font-medium text-primary flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI title ideas — click one to use it</p><button type="button" aria-label="Dismiss title ideas" onClick={() => setTitleSuggestions([])}><X className="w-3.5 h-3.5 text-muted-foreground" /></button></div>
                      <div className="flex flex-col gap-1.5">
                        {titleSuggestions.map((title) => <button key={title} type="button" className="text-left text-sm rounded-lg border border-border bg-background px-3 py-1.5 hover:border-primary/40" onClick={() => { set("title", title.slice(0, 160)); setTitleSuggestions([]); }}>{title}</button>)}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="cp-description">Rationale and implementation <span className="text-danger">*</span></Label>
                    {canUseAI && (form.description.trim().length >= 20 ? aiButton("improve_description", "Improve with AI") : aiButton("draft_description", "Write with AI"))}
                  </div>
                  <Textarea id="cp-description" rows={6} maxLength={5000} value={form.description} placeholder="Why is this project needed, what will you do, who benefits, and what outcome do you expect?" className="focus-visible:ring-primary/30" onChange={(event) => set("description", event.target.value)} />
                  {descriptionSuggestion && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2" data-testid="ai-description-suggestion">
                      <p className="text-xs font-medium text-primary flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI suggestion — review it before using</p>
                      <p className="text-sm whitespace-pre-wrap text-foreground">{descriptionSuggestion}</p>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" className="h-7 text-xs bg-primary hover:bg-primary-dark text-white" onClick={() => { set("description", descriptionSuggestion.slice(0, 5000)); setDescriptionSuggestion(null); }}>Use this text</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDescriptionSuggestion(null)}>Discard</Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="cp-start">Start date <span className="text-danger">*</span></Label><Input id="cp-start" type="date" value={form.startsOn} onChange={(event) => set("startsOn", event.target.value)} /></div>
                  <div className="space-y-1.5"><Label htmlFor="cp-end">End date <span className="text-danger">*</span></Label><Input id="cp-end" type="date" value={form.endsOn} min={form.startsOn || undefined} onChange={(event) => set("endsOn", event.target.value)} /></div>
                </div>
              </section>

              <Separator />

              {/* Community & beneficiaries */}
              <section className="space-y-4">
                <p className="text-muted-foreground font-medium">Community & Beneficiaries</p>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-barangay">Target barangay <span className="text-danger">*</span></Label>
                    <select id="cp-barangay" className={fieldClass} value={form.barangayId} onChange={(event) => setForm((current) => ({ ...current, barangayId: event.target.value, sitioId: "", needId: "", evidence: null }))}>
                      <option value="">Choose a barangay</option>
                      {catalog.barangays.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-sitio">Sitio</Label>
                    <select id="cp-sitio" className={fieldClass} value={form.sitioId} disabled={!barangay} onChange={(event) => setForm((current) => ({ ...current, sitioId: event.target.value, evidence: null }))}>
                      <option value="">Whole barangay</option>
                      {barangay?.sitios.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-need">Approved community need <span className="text-danger">*</span></Label>
                    <select id="cp-need" className={fieldClass} value={form.needId} disabled={!barangay} onChange={(event) => set("needId", event.target.value)}>
                      <option value="">{barangay && needs.length === 0 ? "No approved needs for this barangay yet" : "Choose the need this project addresses"}</option>
                      {needs.map((need) => <option key={need.id} value={need.id}>{need.title}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-coverage">Coverage</Label>
                    <select id="cp-coverage" className={fieldClass} value={form.coverage} onChange={(event) => set("coverage", event.target.value as FormState["coverage"])}>
                      <option value="partial">Part of the need</option>
                      <option value="full">The whole need</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-beneficiary">Beneficiary group <span className="text-danger">*</span></Label>
                    <select id="cp-beneficiary" className={fieldClass} value={form.beneficiaryCategory} onChange={(event) => setForm((current) => ({ ...current, beneficiaryCategory: event.target.value, evidence: null }))}>
                      <option value="">Choose a group</option>
                      {catalog.beneficiaryCategories.map((row) => <option key={row.code} value={row.code}>{row.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-count">Planned beneficiaries <span className="text-danger">*</span></Label>
                    <Input id="cp-count" type="number" min={1} step={1} value={form.beneficiaryCount} onChange={(event) => set("beneficiaryCount", event.target.value)} />
                  </div>
                </div>
                {form.evidence ? (
                  <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm space-y-2">
                    <p>The count uses approved profiling evidence: <span className="text-muted-foreground">{form.evidence.summary}</span></p>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => set("evidence", null)}>Use my own documented count instead</Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-source">Source of the beneficiary count <span className="text-danger">*</span></Label>
                    <Textarea id="cp-source" rows={2} maxLength={500} value={form.beneficiarySource} placeholder="e.g. Barangay Secretary's list of enrolled out-of-school youth, March 2026 (no names)" onChange={(event) => set("beneficiarySource", event.target.value)} />
                  </div>
                )}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">SDG alignment <span className="text-danger">*</span></legend>
                  <div className="grid grid-cols-2 gap-2">
                    {FOCUS_SDG_NUMBERS.map((n) => {
                      const checked = form.sdgs.includes(n);
                      return (
                        <label key={n} className={`flex items-start gap-2 rounded-lg border p-2 text-xs cursor-pointer transition-colors ${checked ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                          <input type="checkbox" className="mt-0.5" checked={checked} onChange={(event) => set("sdgs", event.target.checked ? [...form.sdgs, n].sort((a, b) => a - b) : form.sdgs.filter((value) => value !== n))} />
                          <span><span className="font-bold" style={{ color: SDG_COLORS[n] }}>SDG {n}</span><span className="block text-muted-foreground">{SDG_LABELS[n]}</span></span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </section>

              <Separator />

              {/* Budget */}
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground font-medium">Budget & Resources</p>
                  <p className="text-xs text-muted-foreground">Cash {peso(cashTotal)} · In kind {peso(inKindTotal)}</p>
                </div>
                <label className="flex items-start gap-2.5 rounded-xl border border-border p-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={form.zeroCash} onChange={(event) => setForm((current) => ({ ...current, zeroCash: event.target.checked, lines: event.target.checked ? current.lines.map((line) => ({ ...line, kind: "in_kind" as const })) : current.lines }))} />
                  <span className="text-sm"><span className="font-medium">No cash needed</span><span className="block text-xs text-muted-foreground">Every resource is donated or provided in kind.</span></span>
                </label>
                {form.zeroCash && <Input value={form.zeroCashJustification} maxLength={500} placeholder="Why is no cash needed?" onChange={(event) => set("zeroCashJustification", event.target.value)} />}
                <div className="space-y-3">
                  {form.lines.map((line, index) => (
                    <div key={line.key} className="rounded-xl border border-border p-3 space-y-2" data-testid="budget-line">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">Item {index + 1} · {peso(lineAmount(line))}</p>
                        <button type="button" aria-label={`Remove budget item ${index + 1}`} disabled={form.lines.length === 1} className="text-muted-foreground hover:text-danger disabled:opacity-30" onClick={() => set("lines", form.lines.filter((row) => row.key !== line.key))}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="grid gap-2 grid-cols-2">
                        <Input aria-label="Item description" className="col-span-2" value={line.description} maxLength={500} placeholder="e.g. Printed learning modules" onChange={(event) => setLine(line.key, { description: event.target.value })} />
                        <select aria-label="Budget category" className={fieldClass} value={line.categoryId} onChange={(event) => setLine(line.key, { categoryId: event.target.value })}>
                          <option value="">Category</option>
                          {catalog.budgetCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                        </select>
                        <select aria-label="Resource type" className={fieldClass} value={line.kind} disabled={form.zeroCash} onChange={(event) => setLine(line.key, { kind: event.target.value as BudgetLine["kind"] })}>
                          <option value="cash">Cash</option>
                          <option value="in_kind">In kind</option>
                        </select>
                      </div>
                      <div className="grid gap-2 grid-cols-3">
                        <Input aria-label="Quantity" inputMode="decimal" value={line.quantity} placeholder="Qty" onChange={(event) => setLine(line.key, { quantity: event.target.value })} />
                        <Input aria-label="Unit" value={line.unit} maxLength={40} placeholder="Unit" onChange={(event) => setLine(line.key, { unit: event.target.value })} />
                        {line.kind === "cash"
                          ? <Input aria-label="Unit cost in pesos" inputMode="decimal" value={line.unitCost} placeholder="Unit cost (₱)" onChange={(event) => setLine(line.key, { unitCost: event.target.value })} />
                          : <Input aria-label="Estimated value in pesos" inputMode="decimal" value={line.value} placeholder="Total value (₱)" onChange={(event) => setLine(line.key, { value: event.target.value })} />}
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => set("lines", [...form.lines, { ...newLine(form.lines[form.lines.length - 1]?.categoryId ?? ""), kind: form.zeroCash ? "in_kind" : "cash" }])}><Plus className="w-3.5 h-3.5" /> Add budget item</Button>
                </div>
              </section>

              {canUseAI && (
                <>
                  <Separator />
                  <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3" data-testid="ai-review">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" /> AI pre-submission check</p>
                        <p className="text-xs text-muted-foreground">Advisory feedback on clarity and completeness. It does not affect the PARAYA review.</p>
                      </div>
                      {aiButton("review", review ? "Check again" : "Check my draft")}
                    </div>
                    {review && (
                      <div className="space-y-2 text-sm">
                        <p>{review.summary}</p>
                        {([["Strengths", review.strengths, "text-success"], ["Gaps", review.gaps, "text-danger"], ["Suggestions", review.suggestions, "text-primary"]] as const).map(([label, items, color]) => items.length > 0 && (
                          <div key={label}>
                            <p className={`text-xs font-semibold ${color}`}>{label}</p>
                            <ul className="list-disc pl-5 text-muted-foreground">{items.map((item) => <li key={item}>{item}</li>)}</ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}

              {issues.length > 0 && (
                <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                  <p className="font-medium">Please fix the following:</p>
                  <ul className="list-disc pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border px-6 py-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark text-white gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? "Save changes" : "Save draft"}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
