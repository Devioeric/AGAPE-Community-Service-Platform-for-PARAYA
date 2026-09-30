"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { hasCapability, type Capability, type PermissionOverrides } from "@/lib/auth/capabilities";
import { FinanceOperations } from "./FinanceOperations";
import { HistoricalOperations } from "./HistoricalOperations";
import { PartnerOperations } from "./PartnerOperations";
import { ProposalOperations } from "./ProposalOperations";
import { Phase2Notice, StatusPill, phase2Api } from "./Phase2Ui";
import { isDemoPresentation } from "@/lib/demo-presentation";

type Flags = { partners: boolean; history: boolean; proposals: boolean; finance: boolean; integrity: boolean };
type Tab = "partners" | "history" | "proposals" | "finance";
type Readiness = { mode?: string; readyForLive?: boolean; missingAttestations?: string[]; writeAuthority?: string | null };
const readinessCapabilities = { partners: "partner.policy.manage", historical_programs: "historical_program.review", proposals: "proposal.catalog.manage", program_finance: "budget.category.manage" } as const satisfies Record<string, Capability>;

export function Phase2Workspace({ flags, role, permissions }: { flags: Flags; role: string; permissions?: PermissionOverrides }) {
  const can = useCallback((capability: Capability) => hasCapability(role, permissions, capability), [role, permissions]);
  const tabs = useMemo(() => [
    { id: "partners" as const, label: "Partner registry", enabled: flags.partners, visible: can("partnership.read") },
    { id: "history" as const, label: "Historical programs", enabled: flags.history, visible: can("historical_program.read") },
    { id: "proposals" as const, label: "Structured proposals", enabled: flags.proposals, visible: can("proposal.read") },
    { id: "finance" as const, label: "Finance monitoring", enabled: flags.finance, visible: can("budget.read") },
  ].filter((tab) => tab.visible), [can, flags]);
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? "partners"); const [readiness, setReadiness] = useState<Record<string, Readiness>>({});
  useEffect(() => { if (!tabs.some((item) => item.id === tab) && tabs[0]) setTab(tabs[0].id); }, [tab, tabs]);
  useEffect(() => { let cancelled = false; void (async () => { const entries = await Promise.all(Object.entries(readinessCapabilities).filter(([, capability]) => can(capability)).map(async ([component]) => { try { return [component, await phase2Api<Readiness>(`/api/v2/runtime/${component}`)] as const; } catch { return [component, {}] as const; } })); if (!cancelled) setReadiness(Object.fromEntries(entries)); })(); return () => { cancelled = true; }; }, [can]);
  const component = tab === "history" ? "historical_programs" : tab === "finance" ? "program_finance" : tab;
  const selected = tabs.find((item) => item.id === tab); const status = readiness[component] ?? {};
  const demo = isDemoPresentation();

  return <div className="space-y-5">
    <header className="rounded-xl border bg-white p-5 shadow-sm"><nav aria-label="Phase 2 workspaces" className="flex flex-wrap gap-2">{tabs.map((item) => <button data-testid={`phase2-tab-${item.id}`} key={item.id} onClick={() => setTab(item.id)} className={`rounded-md px-3 py-2 text-sm ${tab === item.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>{item.label} {!demo && <span className="ml-1 text-xs">{item.enabled ? "available" : "off"}</span>}</button>)}</nav>{!demo && <div className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-3"><div>Database mode <StatusPill value={status.mode ?? "unavailable"} /></div><div>Write authority <StatusPill value={status.writeAuthority ?? "not applicable"} /></div><div>Live readiness <StatusPill value={status.readyForLive ? "attested" : "blocked"} /></div></div>}{!demo && status.missingAttestations?.length ? <p className="mt-2 text-xs text-amber-800">Missing readiness attestations: {status.missingAttestations.join(", ")}</p> : null}</header>
    {tabs.length === 0 && <Phase2Notice tone="error" message="Your role has no Phase 2 operational capability." />}
    {selected && !selected.enabled && <Phase2Notice message={`${selected.label} remains disabled until its release gate and database runtime are explicitly enabled.`} />}
    {selected?.enabled && tab === "partners" && <PartnerOperations canManage={can("partnership.manage")} canContacts={can("partner.contact.manage")} canRenew={can("partner.renew")} canMap={can("partner.legacy_mapping.manage")} canReadDocuments={can("partner.document.read")} canDocuments={can("partner.document.manage")} canReviewDocuments={can("partner.policy.manage")} />}
    {selected?.enabled && tab === "history" && <HistoricalOperations canCreate={can("historical_program.create")} canImport={can("historical_program.import")} canReview={can("historical_program.review")} canDocuments={can("historical_program.create")} canReviewDocuments={can("partner.policy.manage")} />}
    {selected?.enabled && tab === "proposals" && <ProposalOperations canCreate={can("proposal.create")} canReview={can("proposal.review")} canEvidence={can("proposal.evidence.confirm")} canDecide={can("proposal.decide")} canSubmit={can("proposal.submit")} canHandoff={can("proposal.handoff")} />}
    {selected?.enabled && tab === "finance" && <FinanceOperations canReadProposal={can("proposal.read")} canReviewProposal={can("budget.review")} canRecordActual={can("budget.actual.record")} canReviewActual={can("budget.review")} canReviewLiquidation={can("budget.liquidation.review")} canDocuments={can("budget.actual.record")} canReviewDocuments={can("partner.policy.manage")} integrityEnabled={flags.integrity} canIntegrityRead={can("integrity.finance.read")} canIntegrityRequest={can("integrity.finance.request")} />}
  </div>;
}
