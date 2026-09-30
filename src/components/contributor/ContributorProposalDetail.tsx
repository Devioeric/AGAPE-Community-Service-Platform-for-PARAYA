"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, CircleAlert, Loader2, MessageSquareQuote, Pencil, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { hasCapability } from "@/lib/auth/capabilities";
import { SDG_COLORS, SDG_LABELS } from "@/lib/constants";
import { contributorCanEdit, warningLabel, workflowEventLabel } from "@/lib/contributor/proposal-status";
import { phase2Api, jsonRequest } from "@/components/phase2/Phase2Ui";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import type { EditableProposalDetail } from "@/components/phase2/evidence-editing";
import type { ContributorCatalog } from "./ContributorProposalForm";
import { PipelineStepper, StatusBadge, fmtDate, loadContributorCatalog, peso } from "./ContributorUi";

export type ContributorProposalDetailData = EditableProposalDetail & {
  workflow: Array<{ id: string; action: string; fromStatus: string | null; toStatus: string | null; remarks: string | null; occurredAt: string }>;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="text-xs font-semibold text-muted-foreground">{label}</p><div className="text-foreground mt-0.5">{children}</div></div>;
}

export function ContributorProposalDetail({ proposalId, open, onOpenChange, onEdit, onChanged }: {
  proposalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (detail: ContributorProposalDetailData) => void;
  onChanged: () => void;
}) {
  const { role, permissions } = useDashboardActor();
  const canSubmit = hasCapability(role, permissions, "contributor.proposal.submit");
  const canRevise = hasCapability(role, permissions, "contributor.proposal.edit") || hasCapability(role, permissions, "contributor.proposal.revise");
  const canUseAI = hasCapability(role, permissions, "ai.assist");
  const [detail, setDetail] = useState<ContributorProposalDetailData | null>(null);
  const [catalog, setCatalog] = useState<ContributorCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [next, nextCatalog] = await Promise.all([
        phase2Api<ContributorProposalDetailData>(`/api/v2/proposals/${id}`),
        loadContributorCatalog().catch(() => null),
      ]);
      setDetail(next);
      setCatalog(nextCatalog);
      setAcknowledged([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This proposal could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && proposalId) void load(proposalId);
    if (!open) setDetail(null);
  }, [open, proposalId, load]);

  async function submit() {
    if (!detail) return;
    setSubmitting(true);
    try {
      await phase2Api(`/api/v2/proposals/${detail.id}/workflow`, jsonRequest("POST", { action: "submit", expectedVersion: detail.rowVersion, acknowledgedWarningCodes: acknowledged }));
      toast.success(detail.status === "revisions_requested" ? "Proposal resubmitted to PARAYA." : "Proposal submitted to PARAYA for review.");
      onChanged();
      await load(detail.id);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The proposal could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  const label = <T extends { id: string }>(rows: T[] | undefined, id: string | null | undefined, pick: (row: T) => string, fallback = "—") => {
    const row = id ? rows?.find((candidate) => candidate.id === id) : undefined;
    return row ? pick(row) : fallback;
  };
  const lead = detail?.targets.find((target) => target.isLead) ?? detail?.targets[0];
  const barangay = catalog?.barangays.find((row) => row.id === lead?.barangayId);
  const sitio = barangay?.sitios.find((row) => row.id === lead?.sitioId);
  const feedback = detail ? [...detail.workflow].reverse().find((event) => event.remarks) : undefined;
  const editable = detail ? contributorCanEdit(detail.status) : false;
  const missingAcknowledgements = detail ? detail.requiredWarnings.filter((code) => !acknowledged.includes(code)) : [];
  const budgetItems = detail?.budget?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
          <SheetTitle className="font-heading text-lg leading-snug">{detail?.title ?? "Proposal Details"}</SheetTitle>
          {detail && <StatusBadge status={detail.status} className="mt-1 self-start" />}
        </SheetHeader>

        <div data-sheet-scroll-region className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-4 sm:px-6 py-5 space-y-6">
          {loading && !detail ? (
            <div className="py-20 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…</div>
          ) : error ? (
            <div role="alert" className="py-20 text-center space-y-3">
              <CircleAlert className="w-5 h-5 text-danger mx-auto" />
              <p className="text-sm text-muted-foreground">{error}</p>
              {proposalId && <Button variant="outline" size="sm" onClick={() => void load(proposalId)}>Retry</Button>}
            </div>
          ) : detail ? (
            <>
              <div className="space-y-2">
                <p className="text-muted-foreground font-medium">Review Pipeline</p>
                <PipelineStepper status={detail.status} />
              </div>

              {feedback && (
                <div className={`rounded-xl border p-4 text-sm ${detail.status === "revisions_requested" ? "border-accent/40 bg-accent/10" : "border-border bg-muted/20"}`} data-testid="officer-feedback">
                  <p className="font-medium flex items-center gap-2"><MessageSquareQuote className="w-4 h-4 text-primary" /> Reviewer feedback</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-foreground">{feedback.remarks}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{workflowEventLabel(feedback.action, feedback.toStatus)} · {fmtDate(feedback.occurredAt)}</p>
                </div>
              )}

              {editable && (canSubmit || canRevise) && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <p className="text-sm font-medium">{detail.status === "revisions_requested" ? "Revise the proposal, then resubmit it." : "This proposal is a draft. Submit it when it is ready for PARAYA review."}</p>
                  {detail.requiredWarnings.length > 0 && canSubmit && (
                    <fieldset className="space-y-1.5">
                      <legend className="text-xs font-semibold text-warning">Confirm before submitting</legend>
                      {detail.requiredWarnings.map((code) => (
                        <label key={code} className="flex items-start gap-2 text-sm">
                          <input type="checkbox" className="mt-0.5" checked={acknowledged.includes(code)} onChange={(event) => setAcknowledged((current) => event.target.checked ? [...current, code] : current.filter((value) => value !== code))} />
                          <span>{warningLabel(code)}</span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {canRevise && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(detail)}><Pencil className="w-3.5 h-3.5" /> {detail.status === "revisions_requested" ? "Revise" : "Edit"}</Button>}
                    {canSubmit && (
                      <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary-dark text-white" disabled={submitting || missingAcknowledgements.length > 0} onClick={() => void submit()}>
                        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {detail.status === "revisions_requested" ? "Resubmit to PARAYA" : "Submit to PARAYA"}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-4 text-sm">
                <Field label="Rationale and implementation"><p className="whitespace-pre-wrap">{detail.description}</p></Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Organization">{label(catalog?.partners, detail.originatingPartnerId, (row) => row.name)}</Field>
                  <Field label="Category">{label(catalog?.projectCategories, detail.projectCategoryId, (row) => row.label)}</Field>
                  <Field label="Schedule">{fmtDate(detail.startsOn)} — {fmtDate(detail.endsOn)}</Field>
                  <Field label="Target area">{barangay?.name ?? "—"}{sitio ? ` · ${sitio.name}` : ""}</Field>
                  <Field label="Community need">{detail.needs.map((need) => label(catalog?.approvedNeeds, need.needId, (row) => row.title, "Approved need")).join(", ") || "—"}</Field>
                  <Field label="Beneficiaries">
                    {detail.beneficiaryEstimates.reduce((sum, estimate) => sum + estimate.finalCount, 0).toLocaleString("en-PH")}{" "}
                    <span className="text-muted-foreground">{detail.beneficiaryEstimates.map((estimate) => catalog?.beneficiaryCategories.find((row) => row.code === estimate.categoryCode)?.label ?? estimate.categoryCode).join(", ")}</span>
                  </Field>
                </div>
                {detail.beneficiaryEstimates[0]?.sourceDescription && <Field label="Source of the count"><p className="text-muted-foreground">{detail.beneficiaryEstimates[0].sourceDescription}</p></Field>}
                {detail.sdgs.length > 0 && (
                  <Field label="SDG alignment">
                    <div className="flex flex-wrap gap-2 mt-1">
                      {detail.sdgs.map((sdg) => {
                        const color = SDG_COLORS[sdg.number] ?? "#6B6356";
                        return <div key={sdg.number} className="rounded-lg p-2 text-xs" style={{ backgroundColor: `${color}18`, border: `1px solid ${color}40` }}><span className="font-bold" style={{ color }}>SDG {sdg.number}</span><span className="text-muted-foreground ml-1">{SDG_LABELS[sdg.number] ?? ""}</span></div>;
                      })}
                    </div>
                  </Field>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground font-medium">Budget</p>
                  <p className="text-sm">Cash <span className="font-semibold">{peso(Number(detail.budget?.cashTotal ?? 0))}</span> · In kind <span className="font-semibold">{peso(Number(detail.budget?.inKindTotal ?? 0))}</span></p>
                </div>
                {detail.budget?.zeroCash && <p className="text-xs text-muted-foreground">No cash needed: {detail.budget.zeroCashJustification}</p>}
                <div className="overflow-x-auto rounded-xl border border-border">
                  <PaginatedTable rows={budgetItems} label="Budget items">
                  {(pageRows) => (
                  <table className="w-full text-sm" aria-label="Budget items">
                    <thead><tr className="bg-surface-alt/50 text-muted-foreground"><th className="text-left font-medium px-3 py-2">Item</th><th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Category</th><th className="text-left font-medium px-3 py-2">Quantity</th><th className="text-right font-medium px-3 py-2">Amount</th></tr></thead>
                    <tbody>
                      {pageRows.map((item) => (
                        <tr key={item.id} className="border-t border-border/60">
                          <td className="px-3 py-2">{item.description}<span className="ml-2 text-[11px] text-muted-foreground">{item.kind === "cash" ? "Cash" : "In kind"}</span></td>
                          <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{label(catalog?.budgetCategories, item.categoryId, (row) => row.label)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{Number(item.quantity).toLocaleString("en-PH")} {item.unit}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{peso(Number(item.kind === "cash" ? item.amount : item.inKindValuation ?? 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  )}
                  </PaginatedTable>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-muted-foreground font-medium">History</p>
                {detail.workflow.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not submitted yet.</p>
                ) : (
                  <ol className="relative border-l border-border ml-2 space-y-4">
                    {[...detail.workflow].reverse().map((event) => (
                      <li key={event.id} className="ml-4">
                        <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-background bg-primary/60" />
                        <p className="text-sm font-medium">{workflowEventLabel(event.action, event.toStatus)}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(event.occurredAt)}</p>
                        {event.remarks && <p className="mt-1 text-sm text-foreground/80 whitespace-pre-wrap">{event.remarks}</p>}
                      </li>
                    ))}
                  </ol>
                )}
                {detail.versions.length > 0 && (
                  <p className="text-xs text-muted-foreground">Submitted versions: {detail.versions.map((version) => `v${version.versionNumber} (${fmtDate(version.createdAt)})`).join(", ")}</p>
                )}
              </div>

              {canUseAI && (
                <Link href="/contributor/chatbot" className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm hover:border-primary/30 hover:bg-primary/5">
                  <Bot className="w-4 h-4 text-primary" /> Questions about this proposal or the review process? Ask the AI Assistant.
                </Link>
              )}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
