"use client";

import { useState, type FormEvent } from "react";
import { historicalProgramCreateSchema } from "@/lib/phase2/contracts";
import { FOCUS_SDG_NUMBERS, isFocusSdg } from "@/lib/sdg-focus.js";
import type { HistoricalProgramDetailDTO } from "@/lib/phase2/types";
import type { z } from "zod";
import { inputClass, textareaClass, primaryButton, secondaryButton, Phase2Notice } from "./Phase2Ui";

export type HistoricalDraft = z.infer<typeof historicalProgramCreateSchema>;
export type HistoricalChoices = {
  partners: Array<{ id: string; name: string }>;
  barangays: Array<{ id: string; name: string }>;
  needs: Array<{ id: string; title: string }>;
};

function LinkedChoices({ name, label, rows, selected }: { name: string; label: string; rows: Array<{ id: string; name: string }>; selected: string[] }) {
  const choices = [...rows, ...selected.filter((id) => !rows.some((row) => row.id === id)).map((id, index) => ({ id, name: `Previously linked ${label.toLowerCase()} ${index + 1}` }))];
  return <label className="text-sm">{label}<select aria-label={label} className={`${inputClass} h-28`} name={name} multiple defaultValue={selected}>{choices.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><span className="text-xs text-slate-500">Choose all applicable records.</span></label>;
}

export function HistoricalDraftForm({ initial, choices, busy, onSave, onCancel }: {
  initial?: HistoricalProgramDetailDTO | null; choices: HistoricalChoices; busy: boolean;
  onSave: (draft: HistoricalDraft) => Promise<boolean>; onCancel?: () => void;
}) {
  const [issues, setIssues] = useState<string[]>([]);
  const [precision, setPrecision] = useState(initial?.datePrecision ?? "exact");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const nullable = (key: string) => text(key) || null;
    const parsed = historicalProgramCreateSchema.safeParse({
      title: text("title"), category: text("category"), summary: nullable("summary"), datePrecision: precision,
      startsOn: precision === "unknown" ? null : nullable("startsOn"), endsOn: nullable("endsOn"),
      beneficiaryCount: text("beneficiaryCount") ? Number(text("beneficiaryCount")) : null,
      volunteerCount: text("volunteerCount") ? Number(text("volunteerCount")) : null,
      volunteerHours: nullable("volunteerHours"), budgetTotal: nullable("budgetTotal"), currency: "PHP",
      resources: nullable("resources"), historicalNeedDescription: nullable("historicalNeedDescription"),
      outcomes: nullable("outcomes"), followUp: nullable("followUp"), sourceType: text("sourceType"), sourceNotes: nullable("sourceNotes"),
      partnerIds: form.getAll("partnerIds").map(String), barangayIds: form.getAll("barangayIds").map(String),
      needIds: form.getAll("needIds").map(String),
      sdgs: [
        ...(initial?.sdgs ?? []).filter(sdg => !isFocusSdg(sdg.number)).map(({ number, source }) => ({ number, source })),
        ...form.getAll("sdgs").map((number) => ({ number: Number(number), source: text(`sdgSource-${number}`) })),
      ],
    });
    if (!parsed.success) { setIssues(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)); return; }
    setIssues([]);
    if (await onSave(parsed.data) && !initial) { element.reset(); setPrecision("exact"); }
  }
  return <form onSubmit={submit} className="grid gap-3 md:grid-cols-3" data-testid="historical-draft-form">
    {issues.length > 0 && <div className="md:col-span-3"><Phase2Notice tone="error" message={issues.join("; ")} /></div>}
    <label className="text-sm">Program title<input className={inputClass} name="title" defaultValue={initial?.title} maxLength={160} required /></label>
    <label className="text-sm">Category<input className={inputClass} name="category" defaultValue={initial?.category} maxLength={80} required /></label>
    <label className="text-sm">Date precision<select className={inputClass} value={precision} onChange={(event) => setPrecision(event.target.value as typeof precision)}><option value="exact">Exact date</option><option value="month">Month/year</option><option value="year">Year only</option><option value="unknown">Unknown</option></select></label>
    <label className="text-sm">Start date<input className={inputClass} name="startsOn" type="date" defaultValue={initial?.startsOn ?? ""} disabled={precision === "unknown"} required={precision !== "unknown"} /></label>
    <label className="text-sm">End date<input className={inputClass} name="endsOn" type="date" defaultValue={initial?.endsOn ?? ""} /></label>
    <label className="text-sm">Source type<select className={inputClass} name="sourceType" defaultValue={initial?.sourceType ?? "paper"}>{["excel", "word", "pdf", "paper", "database", "other"].map((type) => <option key={type}>{type}</option>)}</select></label>
    <LinkedChoices name="partnerIds" label="Partners and proponents" rows={choices.partners} selected={initial?.partnerIds ?? []} />
    <LinkedChoices name="barangayIds" label="Barangays served" rows={choices.barangays} selected={initial?.barangayIds ?? []} />
    <LinkedChoices name="needIds" label="Approved community needs" rows={choices.needs.map((need) => ({ id: need.id, name: need.title }))} selected={initial?.needIds ?? []} />
    <p className="md:col-span-3 text-xs text-slate-600">A known eligible date, at least one Partner and one barangay are required before submission. Incomplete information may be saved as a draft.</p>
    <label className="text-sm">Beneficiaries<input className={inputClass} name="beneficiaryCount" type="number" min="0" step="1" defaultValue={initial?.beneficiaryCount ?? ""} /></label>
    <label className="text-sm">Volunteers<input className={inputClass} name="volunteerCount" type="number" min="0" step="1" defaultValue={initial?.volunteerCount ?? ""} /></label>
    <label className="text-sm">Volunteer hours<input className={inputClass} name="volunteerHours" inputMode="decimal" defaultValue={initial?.volunteerHours ?? ""} /></label>
    <label className="text-sm">Historical budget (PHP)<input className={inputClass} name="budgetTotal" inputMode="decimal" defaultValue={initial?.budgetTotal ?? ""} /></label>
    <label className="md:col-span-2 text-sm">Source provenance<input className={inputClass} name="sourceNotes" defaultValue={initial?.sourceNotes ?? ""} maxLength={1000} /></label>
    {([['summary', 'Reviewed summary'], ['resources', 'Aggregate resources'], ['historicalNeedDescription', 'Historical need'], ['outcomes', 'Aggregate outcomes'], ['followUp', 'Follow-up']] as const).map(([key, label]) => <label className="text-sm" key={key}>{label}<textarea className={textareaClass} name={key} defaultValue={initial?.[key] ?? ""} /></label>)}
    <fieldset className="md:col-span-3 rounded border p-3"><legend className="text-sm">Focus SDGs and source classification</legend><div className="grid gap-2 sm:grid-cols-2">{FOCUS_SDG_NUMBERS.map((number) => <div className="flex items-center gap-2" key={number}><label className="text-sm"><input name="sdgs" type="checkbox" value={number} defaultChecked={initial?.sdgs.some((sdg) => sdg.number === number)} /> SDG {number}</label><select aria-label={`SDG ${number} source`} className={`${inputClass} flex-1`} name={`sdgSource-${number}`} defaultValue={initial?.sdgs.find((sdg) => sdg.number === number)?.source ?? "documented"}><option value="documented">Documented</option><option value="retrospective">Retrospective</option></select></div>)}</div>{initial?.sdgs.some(sdg => !isFocusSdg(sdg.number)) && <p className="mt-2 text-xs text-muted-foreground">Previously recorded out-of-focus SDG classifications are retained unchanged as historical evidence.</p>}</fieldset>
    <div className="md:col-span-3 flex gap-2"><button className={primaryButton} disabled={busy}>{initial ? "Save corrections to this record" : "Save historical draft"}</button>{onCancel && <button type="button" className={secondaryButton} disabled={busy} onClick={onCancel}>Cancel editing</button>}</div>
  </form>;
}
