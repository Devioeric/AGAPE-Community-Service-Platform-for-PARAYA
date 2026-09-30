"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { proposalDraftGraphSchema, type ProposalDraftGraphInput } from "@/lib/phase2/contracts";
import { isFocusSdg } from "@/lib/sdg-focus.js";
import { proposalDraftFromDetail, type EditableProposalDetail } from "./evidence-editing";
import { inputClass, textareaClass, primaryButton, secondaryButton, Phase2Notice } from "./Phase2Ui";

export type ProposalEditorCatalog = {
  partners: Array<{ id: string; name: string }>;
  responsibleOfficers: Array<{ id: string; name: string }>;
  projectCategories: Array<{ id: string; label: string }>;
  beneficiaryCategories: Array<{ code: string; label: string }>;
  budgetCategories: Array<{ id: string; label: string }>;
  barangays: Array<{ id: string; name: string; sitios: Array<{ id: string; name: string }> }>;
  approvedNeeds: Array<{ id: string; barangayId: string; title: string }>;
  sdgs: Array<{ number: number; label: string }>;
};

function InputField({ label, value, onChange, type = "text" }: { label: string; value: string | number | null | undefined; onChange: (value: string) => void; type?: string }) {
  return <label className="text-sm">{label}<input className={inputClass} type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>;
}
function SelectField({ label, value, options, onChange, optional = false }: { label: string; value: string | null | undefined; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; optional?: boolean }) {
  const missing = value && !options.some((option) => option.value === value);
  return <label className="text-sm">{label}<select className={inputClass} value={value ?? ""} onChange={(event) => onChange(event.target.value)}><option value="">{optional ? "None" : "Choose an option"}</option>{missing && <option value={value}>Previously recorded selection</option>}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
function Group({ label, children }: { label: string; children: ReactNode }) { return <fieldset className="space-y-3 rounded border p-3"><legend className="px-1 font-medium">{label}</legend>{children}</fieldset>; }

export function ProposalDraftEditor({ initial, catalog, busy, onSave, onCancel }: {
  initial: EditableProposalDetail; catalog: ProposalEditorCatalog; busy: boolean;
  onSave: (draft: ProposalDraftGraphInput) => Promise<boolean>; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => proposalDraftFromDetail(initial));
  const [issues, setIssues] = useState<string[]>([]);
  const set = <K extends keyof ProposalDraftGraphInput>(key: K, value: ProposalDraftGraphInput[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const targetOptions = draft.targets.map((target) => ({ value: `${target.barangayId}:${target.sitioId ?? "all"}`, label: `${catalog.barangays.find((row) => row.id === target.barangayId)?.name ?? "Recorded barangay"} — ${target.sitioId ? catalog.barangays.flatMap((row) => row.sitios).find((row) => row.id === target.sitioId)?.name ?? "Recorded sitio" : "Barangay-wide"}` }));
  const named = (rows: Array<{ id: string; name: string }>) => rows.map((row) => ({ value: row.id, label: row.name }));
  const labeled = (rows: Array<{ id: string; label: string }>) => rows.map((row) => ({ value: row.id, label: row.label }));
  function updateTarget(index: number, patch: Partial<ProposalDraftGraphInput["targets"][number]>) {
    setDraft((current) => {
      const previous = current.targets[index]; const next = { ...previous, ...patch };
      const oldKey = `${previous.barangayId}:${previous.sitioId ?? "all"}`; const newKey = `${next.barangayId}:${next.sitioId ?? "all"}`;
      return { ...current, targets: current.targets.map((target, i) => i === index ? next : patch.isLead ? { ...target, isLead: false } : target),
        needs: current.needs.map((need) => need.targetAreaKey === oldKey ? { ...need, targetAreaKey: newKey, needId: previous.barangayId !== next.barangayId ? "" : need.needId } : need),
        beneficiaryEstimates: current.beneficiaryEstimates.map((estimate) => estimate.targetAreaKey === oldKey ? { ...estimate, targetAreaKey: newKey, ...(oldKey !== newKey ? { evidenceSnapshotId: null, manualSourceDescription: null, overrideReason: null } : {}) } : estimate) };
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = { ...draft, expectedVersion: initial.rowVersion,
      beneficiaryCategoryCodes: Array.from(new Set(draft.beneficiaryEstimates.map((estimate) => estimate.categoryCode))),
      finalBeneficiaryCount: draft.beneficiaryEstimates.reduce((sum, estimate) => sum + estimate.finalCount, 0) };
    const parsed = proposalDraftGraphSchema.safeParse(candidate);
    if (!parsed.success) { setIssues(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)); return; }
    setIssues([]); await onSave(parsed.data);
  }
  return <form className="space-y-4" onSubmit={submit} data-testid="proposal-correction-form">
    <p className="text-sm text-slate-600">Editing this proposal preserves its identity and earlier frozen revisions. Changes require human submission and the appropriate reviews.</p>
    {issues.length > 0 && <Phase2Notice tone="error" message={issues.join("; ")} />}
    <div className="grid gap-3 md:grid-cols-3">
      <InputField label="Project title" value={draft.title} onChange={(value) => set("title", value)} />
      <SelectField label="Project category" value={draft.projectCategoryId} options={labeled(catalog.projectCategories)} onChange={(value) => set("projectCategoryId", value)} />
      <SelectField label="Responsible officer" value={draft.responsibleOfficerId} options={named(catalog.responsibleOfficers)} onChange={(value) => set("responsibleOfficerId", value)} />
      <SelectField label="Origin" value={draft.originChannel} options={[{ value: "paraya_internal", label: "PARAYA internal" }, { value: "partner_document", label: "Partner document" }, { value: "barangay_referral", label: "Barangay referral" }]} onChange={(value) => set("originChannel", value as typeof draft.originChannel)} />
      <SelectField label="Originating proponent" value={draft.originatingPartnerId} options={named(catalog.partners)} optional onChange={(value) => set("originatingPartnerId", value || null)} />
      <InputField label="Start date" type="date" value={draft.startsOn} onChange={(value) => set("startsOn", value)} />
      <InputField label="End date" type="date" value={draft.endsOn} onChange={(value) => set("endsOn", value)} />
      <label className="text-sm md:col-span-3">Rationale and implementation<textarea className={textareaClass} value={draft.description} onChange={(event) => set("description", event.target.value)} /></label>
    </div>
    <Group label="Target areas">{draft.targets.map((target, index) => <div className="grid gap-2 rounded border p-3 md:grid-cols-3" key={index}>
      <SelectField label={`Target ${index + 1} barangay`} value={target.barangayId} options={named(catalog.barangays)} onChange={(barangayId) => updateTarget(index, { barangayId, sitioId: null })} />
      <SelectField label="Sitio (none means barangay-wide)" value={target.sitioId} options={named(catalog.barangays.find((row) => row.id === target.barangayId)?.sitios ?? [])} optional onChange={(sitioId) => updateTarget(index, { sitioId: sitioId || null })} />
      <label className="text-sm"><input type="radio" name="leadTarget" checked={target.isLead} onChange={() => updateTarget(index, { isLead: true })} /> Lead target</label>
      <button className={secondaryButton} type="button" disabled={target.isLead || draft.targets.length === 1 || draft.needs.some((need) => need.targetAreaKey === targetOptions[index].value) || draft.beneficiaryEstimates.some((estimate) => estimate.targetAreaKey === targetOptions[index].value)} onClick={() => set("targets", draft.targets.filter((_, i) => i !== index))}>Remove unlinked target area</button>
    </div>)}<button className={secondaryButton} type="button" onClick={() => set("targets", [...draft.targets, { barangayId: "", sitioId: null, isLead: false }])}>Add target area</button></Group>
    <Group label="Approved needs">{draft.needs.map((need, index) => { const update = (patch: Partial<typeof need>) => set("needs", draft.needs.map((item, i) => i === index ? { ...item, ...patch } : item)); return <div className="grid gap-2 rounded border p-3 md:grid-cols-3" key={index}>
      <SelectField label="Target" value={need.targetAreaKey} options={targetOptions} onChange={(value) => update({ targetAreaKey: value, needId: "" })} />
      <SelectField label="Approved need" value={need.needId} options={catalog.approvedNeeds.filter((item) => item.barangayId === need.targetAreaKey.split(":")[0]).map((item) => ({ value: item.id, label: item.title }))} onChange={(value) => update({ needId: value })} />
      <SelectField label="Intended coverage" value={need.intendedCoverage} options={[{ value: "partial", label: "Partial" }, { value: "full", label: "Full" }]} onChange={(value) => update({ intendedCoverage: value as "full" | "partial" })} />
      <InputField label="Planned beneficiaries" type="number" value={need.plannedBeneficiaryCount} onChange={(value) => update({ plannedBeneficiaryCount: value ? Number(value) : null })} />
      <InputField label="Planned coverage percent" type="number" value={need.plannedBeneficiaryPercentage} onChange={(value) => update({ plannedBeneficiaryPercentage: value ? Number(value) : null })} />
      <InputField label="Coverage notes" value={need.notes} onChange={(value) => update({ notes: value || null })} />
      <button className={secondaryButton} type="button" disabled={draft.needs.length === 1} onClick={() => set("needs", draft.needs.filter((_, i) => i !== index))}>Remove need link</button>
    </div>; })}<button className={secondaryButton} type="button" onClick={() => set("needs", [...draft.needs, { needId: "", targetAreaKey: targetOptions[0]?.value ?? "", intendedCoverage: "partial" }])}>Add need link</button></Group>
    <Group label="Beneficiary estimates">{draft.beneficiaryEstimates.map((estimate, index) => { const update = (patch: Partial<typeof estimate>) => set("beneficiaryEstimates", draft.beneficiaryEstimates.map((item, i) => i === index ? { ...item, ...patch } : item)); return <div key={index} className="grid gap-2 rounded border p-3 md:grid-cols-2">
      <SelectField label="Beneficiary category" value={estimate.categoryCode} options={catalog.beneficiaryCategories.map((row) => ({ value: row.code, label: row.label }))} onChange={(value) => update({ categoryCode: value, evidenceSnapshotId: null, manualSourceDescription: null, overrideReason: null })} />
      <SelectField label="Target area" value={estimate.targetAreaKey} options={targetOptions} onChange={(value) => update({ targetAreaKey: value, evidenceSnapshotId: null, manualSourceDescription: null, overrideReason: null })} />
      <InputField label="Final beneficiary count" type="number" value={estimate.finalCount} onChange={(value) => update({ finalCount: Number(value) })} />
      {estimate.evidenceSnapshotId ? <><p className="text-sm">Existing approved aggregate source retained. The server recalculates its value and validates any override.</p><InputField label="Count override reason" value={estimate.overrideReason} onChange={(value) => update({ overrideReason: value || null })} /><button className={secondaryButton} type="button" onClick={() => update({ evidenceSnapshotId: null, manualSourceDescription: null, overrideReason: null })}>Use independent manual source</button></> : <InputField label="Independent count source (no resident details)" value={estimate.manualSourceDescription} onChange={(value) => update({ manualSourceDescription: value || null })} />}
      <button className={secondaryButton} type="button" disabled={draft.beneficiaryEstimates.length === 1} onClick={() => set("beneficiaryEstimates", draft.beneficiaryEstimates.filter((_, i) => i !== index))}>Remove estimate</button>
    </div>; })}<button className={secondaryButton} type="button" onClick={() => set("beneficiaryEstimates", [...draft.beneficiaryEstimates, { categoryCode: "", targetAreaKey: targetOptions[0]?.value ?? "", evidenceSnapshotId: null, finalCount: 1, manualSourceDescription: null, overrideReason: null }])}>Add independently sourced estimate</button><InputField label="Beneficiary evidence summary" value={draft.beneficiarySourceDescription} onChange={(value) => set("beneficiarySourceDescription", value)} /></Group>
    <Group label="Focus SDG alignment"><div className="flex flex-wrap gap-3">{catalog.sdgs.filter(sdg => isFocusSdg(sdg.number)).map((sdg) => <label className="text-sm" key={sdg.number}><input type="checkbox" checked={draft.sdgNumbers.includes(sdg.number)} onChange={(event) => set("sdgNumbers", event.target.checked ? [...draft.sdgNumbers, sdg.number] : draft.sdgNumbers.filter((number) => number !== sdg.number))} /> {sdg.number} {sdg.label}</label>)}</div>{draft.sdgNumbers.some(number => !isFocusSdg(number)) && <p className="text-xs text-muted-foreground">Previously recorded out-of-focus SDG classifications are retained unchanged as historical evidence.</p>}</Group>
    <Group label="Budget lines"><label className="text-sm"><input type="checkbox" checked={draft.zeroCash} onChange={(event) => set("zeroCash", event.target.checked)} /> Zero-cash plan</label>{draft.zeroCash && <InputField label="Zero-cash justification" value={draft.zeroCashJustification} onChange={(value) => set("zeroCashJustification", value || null)} />}
      {draft.budgetItems.map((item, index) => { const update = (patch: Partial<typeof item>) => set("budgetItems", draft.budgetItems.map((row, i) => i === index ? { ...row, ...patch } : row)); return <div className="grid gap-2 rounded border p-3 md:grid-cols-3" key={index}>
        <SelectField label="Budget category" value={item.categoryId} options={labeled(catalog.budgetCategories)} onChange={(value) => update({ categoryId: value })} />
        <SelectField label="Resource kind" value={item.kind} options={[{ value: "cash", label: "Cash" }, { value: "in_kind", label: "In kind" }]} onChange={(value) => update({ kind: value as "cash" | "in_kind" })} />
        <InputField label="Item description" value={item.description} onChange={(value) => update({ description: value })} />
        <InputField label="Quantity" value={item.quantity} onChange={(value) => update({ quantity: value })} /><InputField label="Unit" value={item.unit} onChange={(value) => update({ unit: value })} />
        <InputField label="Unit cost (PHP)" value={item.unitCost} onChange={(value) => update({ unitCost: value })} />
        {item.kind === "in_kind" && <InputField label="In-kind valuation (PHP)" value={item.inKindValuation} onChange={(value) => update({ inKindValuation: value || null })} />}
        <InputField label="Item notes" value={item.notes} onChange={(value) => update({ notes: value || null })} />
        <button className={secondaryButton} type="button" disabled={draft.budgetItems.length === 1} onClick={() => set("budgetItems", draft.budgetItems.filter((_, i) => i !== index))}>Remove budget line</button>
      </div>; })}<button className={secondaryButton} type="button" onClick={() => set("budgetItems", [...draft.budgetItems, { categoryId: "", kind: "cash", description: "", quantity: "1", unit: "item", unitCost: "0.00", sortOrder: draft.budgetItems.length }])}>Add budget line</button>
    </Group>
    <Group label="Funding sources">{draft.fundingSources.map((source, index) => { const update = (patch: Partial<typeof source>) => set("fundingSources", draft.fundingSources.map((row, i) => i === index ? { ...row, ...patch } : row)); return <div className="grid gap-2 rounded border p-3 md:grid-cols-3" key={index}>
      <SelectField label="Funding type" value={source.type} options={["internal_dyci", "external", "cash_donation", "in_kind_donation", "partner_contribution", "other"].map((value) => ({ value, label: value.replaceAll("_", " ") }))} onChange={(value) => update({ type: value as typeof source.type })} />
      <SelectField label="Funding state" value={source.state} options={[{ value: "expected", label: "Expected" }, { value: "confirmed", label: "Confirmed" }]} onChange={(value) => update({ state: value as typeof source.state })} />
      <SelectField label="Contributing partner" value={source.partnerId} options={named(catalog.partners)} optional onChange={(value) => update({ partnerId: value || null })} />
      <InputField label="Cash funding (PHP)" value={source.cashValue} onChange={(value) => update({ cashValue: value })} /><InputField label="In-kind funding (PHP)" value={source.inKindValue} onChange={(value) => update({ inKindValue: value })} /><InputField label="Funding notes" value={source.notes} onChange={(value) => update({ notes: value || null })} />
      <button className={secondaryButton} type="button" onClick={() => set("fundingSources", draft.fundingSources.filter((_, i) => i !== index))}>Remove funding source</button>
    </div>; })}<button className={secondaryButton} type="button" onClick={() => set("fundingSources", [...draft.fundingSources, { type: "internal_dyci", state: "expected", cashValue: "0.00", inKindValue: "0.00" }])}>Add funding source</button></Group>
    <div className="flex gap-2"><button className={primaryButton} disabled={busy}>Save corrections to this proposal</button><button className={secondaryButton} type="button" disabled={busy} onClick={onCancel}>Cancel editing</button></div>
  </form>;
}
