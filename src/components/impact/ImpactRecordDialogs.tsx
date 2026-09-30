"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SDG_LABELS } from "@/lib/constants";
import { INDICATOR_TYPES, followUpTypeLabel, storyTypeLabel } from "./ImpactUi";

// Add and void dialogs for impact records, shared by Records and the program report.
// Payloads match the existing /api/impact, /qualitative, and /followup contracts.

type Program = { id: string; title: string };
type BaseProps = { open: boolean; onOpenChange: (open: boolean) => void; programs: Program[]; defaultProgramId?: string; /** Keeps the preset program fixed, e.g. on a program report. */ lockProgram?: boolean; onSaved: () => void };
export type VoidTarget = { kind: "indicator" | "qualitative" | "followup" | "sdg_outcome"; id: string; label: string };

const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
const manilaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

function Field({ id, label, required, children, hint }: { id: string; label: string; required?: boolean; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required && <span className="ml-0.5 text-danger">*</span>}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProgramField({ id, programs, value, onChange, locked }: { id: string; programs: Program[]; value: string; onChange: (value: string) => void; locked: boolean }) {
  return (
    <Field id={id} label="Program" required>
      <select id={id} value={value} disabled={locked} onChange={(event) => onChange(event.target.value)} className={selectClass}>
        <option value="">Select a program</option>
        {programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
      </select>
    </Field>
  );
}

function RecordDialog({ title, description, open, onOpenChange, saving, onSubmit, children }: {
  title: string; description: string; open: boolean; onOpenChange: (open: boolean) => void; saving: boolean; onSubmit: () => void; children: ReactNode;
}) {
  const formId = useId();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form id={formId} className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>{children}</form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function post(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "The record could not be saved.");
}

export function IndicatorDialog({ open, onOpenChange, programs, defaultProgramId, lockProgram = false, onSaved }: BaseProps) {
  const [programId, setProgramId] = useState(defaultProgramId ?? "");
  const [type, setType] = useState<string>("beneficiaries_reached");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("persons");
  const [date, setDate] = useState(manilaToday());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setProgramId(defaultProgramId ?? ""); setDate(manilaToday()); } }, [open, defaultProgramId]);

  const submit = async () => {
    if (!programId || value === "" || Number(value) < 0 || !unit.trim() || !date) { toast.error("Fill in the program, value, unit, and date."); return; }
    setSaving(true);
    try {
      await post("/api/impact", { program_id: programId, indicator_type: type, value: Number(value), unit: unit.trim(), recorded_date: date, notes: notes.trim() || null });
      toast.success("Impact metric recorded.");
      setValue(""); setNotes("");
      onOpenChange(false); onSaved();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "Failed to save the metric."); }
    finally { setSaving(false); }
  };

  return (
    <RecordDialog title="Record a result" description="A number the program achieved, such as people reached or trainings held." open={open} onOpenChange={onOpenChange} saving={saving} onSubmit={() => void submit()}>
      <div className="sm:col-span-2"><ProgramField id="metric-program" programs={programs} value={programId} onChange={setProgramId} locked={lockProgram && Boolean(defaultProgramId)} /></div>
      <div className="sm:col-span-2">
        <Field id="metric-type" label="What was measured" required>
          <select id="metric-type" value={type} className={selectClass} onChange={(event) => {
            setType(event.target.value);
            const selected = INDICATOR_TYPES.find((item) => item.value === event.target.value);
            if (selected?.unit) setUnit(selected.unit);
          }}>
            {INDICATOR_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
      </div>
      <Field id="metric-value" label="Value" required><Input id="metric-value" type="number" min={0} step="any" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} /></Field>
      <Field id="metric-unit" label="Unit" required><Input id="metric-unit" value={unit} maxLength={50} onChange={(event) => setUnit(event.target.value)} /></Field>
      <Field id="metric-date" label="Date recorded" required><Input id="metric-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <div className="sm:col-span-2"><Field id="metric-notes" label="Notes"><Textarea id="metric-notes" rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div>
    </RecordDialog>
  );
}

export function StoryDialog({ open, onOpenChange, programs, defaultProgramId, lockProgram = false, onSaved }: BaseProps) {
  const [programId, setProgramId] = useState(defaultProgramId ?? "");
  const [type, setType] = useState("testimonial");
  const [content, setContent] = useState("");
  const [date, setDate] = useState(manilaToday());
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setProgramId(defaultProgramId ?? ""); setDate(manilaToday()); } }, [open, defaultProgramId]);

  const submit = async () => {
    if (!programId || content.trim().length < 10 || !date) { toast.error("Choose a program and write at least 10 characters."); return; }
    setSaving(true);
    try {
      // Stories are stored without a subject's name.
      await post("/api/impact/qualitative", { program_id: programId, type, content: content.trim(), recorded_date: date });
      toast.success("Story recorded.");
      setContent("");
      onOpenChange(false); onSaved();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "Failed to save the story."); }
    finally { setSaving(false); }
  };

  return (
    <RecordDialog title="Record a story" description="What changed for the community, in their words or yours. Leave out names." open={open} onOpenChange={onOpenChange} saving={saving} onSubmit={() => void submit()}>
      <div className="sm:col-span-2"><ProgramField id="story-program" programs={programs} value={programId} onChange={setProgramId} locked={lockProgram && Boolean(defaultProgramId)} /></div>
      <Field id="story-type" label="Kind of story" required>
        <select id="story-type" value={type} onChange={(event) => setType(event.target.value)} className={selectClass}>
          {["testimonial", "case_study", "pre_post_narrative", "observation"].map((item) => <option key={item} value={item}>{storyTypeLabel(item)}</option>)}
        </select>
      </Field>
      <Field id="story-date" label="Date recorded" required><Input id="story-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <div className="sm:col-span-2">
        <Field id="story-content" label="Story" required hint="At least 10 characters.">
          <Textarea id="story-content" rows={5} maxLength={10000} value={content} onChange={(event) => setContent(event.target.value)} />
        </Field>
      </div>
    </RecordDialog>
  );
}

export function FollowUpDialog({ open, onOpenChange, programs, defaultProgramId, lockProgram = false, onSaved }: BaseProps) {
  const [programId, setProgramId] = useState(defaultProgramId ?? "");
  const [type, setType] = useState("6_month");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setProgramId(defaultProgramId ?? ""); }, [open, defaultProgramId]);

  const submit = async () => {
    if (!programId || !date) { toast.error("Choose a program and a date."); return; }
    setSaving(true);
    try {
      await post("/api/impact/followup", { program_id: programId, followup_type: type, scheduled_date: date, notes: notes.trim() || null });
      toast.success("Follow-up scheduled.");
      setDate(""); setNotes("");
      onOpenChange(false); onSaved();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "Failed to schedule the follow-up."); }
    finally { setSaving(false); }
  };

  return (
    <RecordDialog title="Schedule a follow-up" description="A return visit to check whether the change lasted." open={open} onOpenChange={onOpenChange} saving={saving} onSubmit={() => void submit()}>
      <div className="sm:col-span-2"><ProgramField id="followup-program" programs={programs} value={programId} onChange={setProgramId} locked={lockProgram && Boolean(defaultProgramId)} /></div>
      <Field id="followup-type" label="When" required>
        <select id="followup-type" value={type} onChange={(event) => setType(event.target.value)} className={selectClass}>
          {["immediate", "6_month", "12_month"].map((item) => <option key={item} value={item}>{followUpTypeLabel(item)}</option>)}
        </select>
      </Field>
      <Field id="followup-date" label="Scheduled date" required><Input id="followup-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <div className="sm:col-span-2"><Field id="followup-notes" label="Notes"><Textarea id="followup-notes" rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div>
    </RecordDialog>
  );
}

export function SdgOutcomeDialog({ open, onOpenChange, programId, plannedSdgs, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; programId: string; plannedSdgs: number[]; onSaved: () => void }) {
  const [sdg, setSdg] = useState(String(plannedSdgs[0] ?? 4));
  const [indicator, setIndicator] = useState("");
  const [contribution, setContribution] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setSdg(String(plannedSdgs[0] ?? 4)); setIndicator(""); setContribution(""); } }, [open, plannedSdgs]);
  const goals = [4, 9, 11, 17].sort((a, b) => (plannedSdgs.includes(b) ? 1 : 0) - (plannedSdgs.includes(a) ? 1 : 0));
  const submit = async () => {
    if (indicator.trim().length < 3 || contribution.trim().length < 10) { toast.error("Add a measured indicator and contribution."); return; }
    setSaving(true);
    try { await post(`/api/impact/programs/${programId}/sdg-outcomes`, { sdg_goal: Number(sdg), actual_indicator: indicator.trim(), actual_contribution: contribution.trim() }); toast.success("SDG contribution recorded."); onOpenChange(false); onSaved(); }
    catch (failure) { toast.error(failure instanceof Error ? failure.message : "The contribution could not be saved."); }
    finally { setSaving(false); }
  };
  return <RecordDialog title="Record an SDG contribution" description="Describe what this started program contributed; the statement remains advisory evidence." open={open} onOpenChange={onOpenChange} saving={saving} onSubmit={() => void submit()}>
    <div className="sm:col-span-2"><Field id="sdg-goal" label="SDG" required><select id="sdg-goal" value={sdg} onChange={(event) => setSdg(event.target.value)} className={selectClass}>{goals.map((goal) => <option key={goal} value={goal}>SDG {goal} · {SDG_LABELS[goal]}{plannedSdgs.includes(goal) ? " (planned)" : ""}</option>)}</select></Field></div>
    <div className="sm:col-span-2"><Field id="sdg-indicator" label="What was measured" required><Input id="sdg-indicator" value={indicator} maxLength={160} onChange={(event) => setIndicator(event.target.value)} /></Field></div>
    <div className="sm:col-span-2"><Field id="sdg-contribution" label="Contribution" required hint="At least 10 characters."><Textarea id="sdg-contribution" rows={4} maxLength={2000} value={contribution} placeholder="e.g. 26 learners completed the reading sessions" onChange={(event) => setContribution(event.target.value)} /></Field></div>
  </RecordDialog>;
}

/**
 * Marks a follow-up done. The database allows scheduled → in_progress →
 * completed and overdue → completed. Each status change also rewrites the
 * notes, so the existing notes are sent along to keep them.
 */
export async function completeFollowUp(row: { id: string; status: string; notes?: string | null }) {
  const patch = async (expected: string, status: string, completedDate?: string) => {
    const response = await fetch(`/api/impact/followup/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected_status: expected, status, notes: row.notes ?? null, ...(completedDate ? { completed_date: completedDate } : {}) }),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "The follow-up could not be updated.");
  };
  let expected = row.status;
  if (expected === "scheduled") { await patch("scheduled", "in_progress"); expected = "in_progress"; }
  await patch(expected, "completed", manilaToday());
}

export function VoidRecordDialog({ target, onClose, onVoided }: { target: VoidTarget | null; onClose: () => void; onVoided: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!target) setReason(""); }, [target]);

  const submit = async () => {
    if (!target || reason.trim().length < 3) return;
    setSaving(true);
    try {
      const path = target.kind === "indicator" ? `/api/impact/${target.id}/void`
        : target.kind === "qualitative" ? `/api/impact/qualitative/${target.id}/void`
          : target.kind === "followup" ? `/api/impact/followup/${target.id}/void` : `/api/impact/sdg-outcomes/${target.id}/void`;
      await post(path, { reason: reason.trim() });
      toast.success("Record voided; its history is kept.");
      onClose(); onVoided();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "The correction failed."); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Void this {target?.label ?? "record"}?</DialogTitle>
          <DialogDescription>It stops counting in every total. The record and your reason stay in the correction history.</DialogDescription>
        </DialogHeader>
        <Field id="void-reason" label="Reason for the correction" required>
          <Textarea id="void-reason" rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Entered under the wrong program" />
        </Field>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button disabled={saving || reason.trim().length < 3} onClick={() => void submit()} className="bg-danger text-white hover:bg-danger/90">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Void record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
