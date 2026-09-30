"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, FileText, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PaginatedTable } from "@/components/shared/PaginatedTable";
import { ExportMenu } from "@/components/shared/ExportMenu";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { hasCapability } from "@/lib/auth/capabilities";
import { PHASE_META, STATUS_LABEL, contributorCanEdit, contributorPhase, contributorProposalStats, statusLabel, type ContributorPhaseKey } from "@/lib/contributor/proposal-status";
import { phase2Api } from "@/components/phase2/Phase2Ui";
import { ContributorProposalForm } from "./ContributorProposalForm";
import { ContributorProposalDetail, type ContributorProposalDetailData } from "./ContributorProposalDetail";
import { PipelineStepper, SdgChips, StatusBadge, fmtDate, peso, useContributorOverview } from "./ContributorUi";

const PHASE_ORDER: ContributorPhaseKey[] = ["preparing", "review", "approved", "closed"];

/**
 * The Contributor's version of the Officer "All proposals" page: the same
 * summary cards, pipeline rollup, and list, limited to this account's own
 * proposals. Review and decision actions stay with PARAYA and Finance.
 */
export function ContributorProposalsBoard() {
  const { role, permissions } = useDashboardActor();
  const canCreate = hasCapability(role, permissions, "contributor.proposal.create") && hasCapability(role, permissions, "contributor.budget.prepare");
  const canRevise = hasCapability(role, permissions, "contributor.proposal.edit") || hasCapability(role, permissions, "contributor.proposal.revise");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, loading, error, reload } = useContributorOverview();
  const proposals = useMemo(() => data?.proposals ?? [], [data]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<ContributorProposalDetailData | null>(null);

  // Deep links from the dashboard: ?new=1 opens the form, ?open=<id> opens a proposal.
  useEffect(() => {
    const open = searchParams.get("open");
    if (searchParams.get("new") === "1" && canCreate) { openCreate(); router.replace("/contributor/proposals"); }
    else if (open) { openDetail(open); router.replace("/contributor/proposals"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the incoming link
  }, []);

  function openCreate() {
    setEditing(null);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  }
  function openDetail(id: string) {
    setDetailId(id);
    setDetailOpen(true);
  }
  function openEditor(detail: ContributorProposalDetailData) {
    setEditing(detail);
    setFormKey((key) => key + 1);
    setDetailOpen(false);
    setFormOpen(true);
  }
  async function editById(id: string) {
    try {
      openEditor(await phase2Api<ContributorProposalDetailData>(`/api/v2/proposals/${id}`));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "This proposal could not be opened.");
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return proposals.filter((row) => {
      const created = (row.createdAt ?? "").slice(0, 10);
      return (!query || row.title.toLowerCase().includes(query) || (row.barangayName ?? "").toLowerCase().includes(query))
        && (statusFilter === "all" || row.status === statusFilter)
        && (!dateFrom || created >= dateFrom)
        && (!dateTo || created <= dateTo);
    });
  }, [proposals, search, statusFilter, dateFrom, dateTo]);

  const stats = useMemo(() => contributorProposalStats(proposals), [proposals]);
  const needsRevision = proposals.filter((row) => row.status === "revisions_requested");
  const filtersActive = Boolean(search || statusFilter !== "all" || dateFrom || dateTo);

  return (
    <div className="space-y-6" data-testid="contributor-proposals">
      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm"><CircleAlert className="w-4 h-4 text-danger" /> {error} <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => void reload()}>Retry</Button></div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: "Total", value: stats.total, accent: "border-l-primary" },
          { label: "Draft", value: stats.draft, accent: "border-l-muted-foreground" },
          { label: "In Review", value: stats.inReview + stats.revisionsRequested, accent: "border-l-warning" },
          { label: "Approved", value: stats.approved, accent: "border-l-success" },
          { label: "Rejected", value: stats.rejected, accent: "border-l-danger" },
        ].map((card) => (
          <Card key={card.label} className={`border-border shadow-card border-l-4 ${card.accent}`}>
            <CardContent className="px-4 py-2.5">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-bold font-heading text-foreground mt-0.5">{loading && !data ? "—" : card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {needsRevision.length > 0 && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm" data-testid="revision-alert">
          <p className="font-medium flex items-center gap-2"><RotateCcw className="w-4 h-4" /> {needsRevision.length} proposal{needsRevision.length > 1 ? "s were" : " was"} returned for revisions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {needsRevision.map((row) => <Button key={row.id} variant="outline" size="sm" className="h-7 text-xs" onClick={() => openDetail(row.id)}>{row.title}</Button>)}
          </div>
        </div>
      )}

      {/* Pipeline rollup */}
      {stats.total > 0 && (
        <Card className="border-border shadow-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-heading text-sm font-semibold flex items-center gap-2"><Workflow className="w-4 h-4 text-primary" /> Pipeline Phase</p>
              <p className="text-xs text-muted-foreground">{peso(stats.cashRequested)} requested · {peso(stats.cashApproved)} approved</p>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
              {PHASE_ORDER.map((key) => stats.phases[key] > 0 && (
                <div key={key} className={PHASE_META[key].color} style={{ width: `${(stats.phases[key] / stats.total) * 100}%` }} title={`${PHASE_META[key].label}: ${stats.phases[key]}`} />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PHASE_ORDER.map((key) => (
                <div key={key} className="flex items-start gap-2 p-2 rounded-lg border border-border">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${PHASE_META[key].color}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-foreground font-medium">{PHASE_META[key].label}</p>
                    <p className="text-[11px] text-muted-foreground">{PHASE_META[key].description}</p>
                    <p className="text-lg font-bold font-heading tabular-nums">{stats.phases[key]}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proposals table */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="font-heading text-lg">Project Proposals</CardTitle>
              <div className="flex items-center gap-2">
                <ExportMenu
                  rows={filtered.map((row) => ({
                    Title: row.title, Organization: row.partnerName ?? "", Barangay: row.barangayName ?? "", Status: statusLabel(row.status),
                    Phase: PHASE_META[contributorPhase(row.status)].label, "Cash (₱)": row.cashTotal, "In kind (₱)": row.inKindTotal,
                    Start: row.startsOn ?? "", End: row.endsOn ?? "", SDGs: row.sdgs.join(", "), Created: row.createdAt ?? "", Submitted: row.submittedAt ?? "",
                  }))}
                  filename="my-proposals"
                  sheetName="Proposals"
                />
                {canCreate && <Button onClick={openCreate} className="bg-primary hover:bg-primary-dark text-white gap-2"><Plus className="w-4 h-4" /> New Proposal</Button>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input placeholder="Search proposals…" aria-label="Search proposals" className="pl-9 h-9 w-52 focus-visible:ring-primary/30" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9">
                <option value="all">All Status</option>
                {Object.entries(STATUS_LABEL).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" title="Created from" aria-label="Created from" />
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" title="Created until" aria-label="Created until" />
              {filtersActive && <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}>Clear</Button>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <PaginatedTable rows={filtered} label="Proposals" resetKey={JSON.stringify([search, statusFilter, dateFrom, dateTo])} loading={loading && !data}>
              {(pageRows) => (
                <table aria-label="Proposals" className="w-full text-sm">
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
                    {loading && !data ? (
                      <tr><td colSpan={5} className="py-16 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={5} className="py-16 text-center text-muted-foreground">{proposals.length === 0 ? (canCreate ? "No proposals yet. Click \"New Proposal\" to create one." : "No proposals yet.") : "No proposals match your filters."}</td></tr>
                    ) : pageRows.map((row, index) => (
                      <tr key={row.id} className={`border-b border-border/60 hover:bg-surface-alt/40 transition-colors cursor-pointer ${index % 2 !== 0 ? "bg-surface-alt/20" : ""}`} onClick={() => openDetail(row.id)}>
                        <td className="py-3 px-4">
                          <p className="font-medium text-foreground leading-snug">{row.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{row.barangayName ?? "No barangay"} · {fmtDate(row.createdAt)}</p>
                          <SdgChips sdgs={row.sdgs} />
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell"><PipelineStepper status={row.status} /></td>
                        <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{peso(row.cashTotal)}{row.inKindTotal > 0 && <span className="block text-[11px]">+ {peso(row.inKindTotal)} in kind</span>}</td>
                        <td className="py-3 px-4"><StatusBadge status={row.status} /></td>
                        <td className="py-3 px-4" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger aria-label={`Actions for ${row.title}`} className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuGroup>
                                <DropdownMenuItem className="cursor-pointer" onClick={() => openDetail(row.id)}><FileText className="w-3.5 h-3.5 mr-2" /> View Details</DropdownMenuItem>
                                {canRevise && contributorCanEdit(row.status) && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => void editById(row.id)}><Pencil className="w-3.5 h-3.5 mr-2" /> {row.status === "revisions_requested" ? "Revise" : "Edit"}</DropdownMenuItem>
                                )}
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PaginatedTable>
          </div>
          {!loading && proposals.length > 0 && <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">{filtered.length} of {proposals.length} proposals</div>}
        </CardContent>
      </Card>

      <ContributorProposalDetail
        proposalId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={openEditor}
        onChanged={() => void reload()}
      />
      <ContributorProposalForm
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={(id) => { setFormOpen(false); void reload(); openDetail(id); }}
      />
    </div>
  );
}
