"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle, AlertCircle, Loader2, Plus, Trash2, Paperclip,
  Users, Calendar, FileText, Download, X, Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ValidationLinkPicker, LinkedRecordCard, type LinkedRecord } from "@/components/shared/ValidationLinkPicker";

// Evidence-backed Community Validation panel.
// Drop-in for the existing attestation block on the proposal detail sheet.
//
// One proposal can have multiple validation events (e.g. one per consultation
// round). Each event needs a method, date, ≥3 stakeholders, ≥1 evidence file,
// and a summary of what the community said. The DB trigger flips the parent
// proposal's `community_validated` flag automatically when those criteria are met.

// ─── Types ──────────────────────────────────────────────────────────────────

type Method = "fgd" | "key_informant" | "town_hall" | "consultation" | "door_to_door" | "other";

interface Stakeholder {
  id?:               string;
  stakeholder_name:  string;
  role:              string | null;
  present:           boolean;
}

interface Evidence {
  id:           string;
  file_name:    string;
  mime_type:    string | null;
  file_size:    number | null;
  storage_path: string;
  url:          string | null;
  created_at:   string;
  uploader:     string | null;
}

interface Validation {
  id:             string;
  method:         Method;
  date_conducted: string;   // yyyy-mm-dd
  summary:        string;
  recorder_name:  string | null;
  created_at:     string;
  stakeholders:   Stakeholder[];
  evidence:       Evidence[];
}

const METHOD_LABELS: Record<Method, string> = {
  fgd:           "Focus Group Discussion",
  key_informant: "Key Informant Interview",
  town_hall:     "Town Hall / Barangay Assembly",
  consultation:  "Community Consultation",
  door_to_door:  "Door-to-door Visits",
  other:         "Other",
};

const MIN_STAKEHOLDERS  = 3;
const MIN_EVIDENCE      = 1;
const MIN_SUMMARY_CHARS = 20;

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  proposalId:     string;
  proposalStatus: string;
  /** Header-level boolean cached on the proposal — driven by DB trigger. */
  validatedFlag:  boolean | null;
  /** Barangay this proposal targets — used to filter the picker's candidate
   *  list to records from the same community. Optional; if absent, the picker
   *  shows everything the caller is allowed to see. */
  proposalBarangayId?: string | null;
  /** Whether to render the "Add new" affordance. Defaults true when status
   *  is draft / submitted / revisions_requested. */
  canRecord?:     boolean;
  /** Notified after each successful save so the parent can refresh its
   *  cached proposal detail (so the green "Attested" badge updates). */
  onChange?:      () => void;
}

export function CommunityValidationSection({
  proposalId, proposalStatus, validatedFlag, proposalBarangayId, canRecord, onChange,
}: Props) {
  const [list, setList]       = useState<Validation[]>([]);
  const [links, setLinks]     = useState<LinkedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Stable ref for the onChange so this component's load callback doesn't
  // invalidate on every parent render.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const load = useCallback(async () => {
    setLoading(true);
    const [vRes, lRes] = await Promise.all([
      fetch(`/api/proposals/${proposalId}/validations`),
      fetch(`/api/proposals/${proposalId}/validation-links`),
    ]);
    if (vRes.ok) setList(((await vRes.json()).data ?? []) as Validation[]);
    if (lRes.ok) setLinks(((await lRes.json()).data ?? []) as LinkedRecord[]);
    setLoading(false);
  }, [proposalId]);

  useEffect(() => { load(); }, [load]);

  // Recommendation-derived planning sources stay visible, but only links
  // explicitly recorded as human validation can satisfy this gate.
  const validationLinks = links.filter((link) => link.provenance_kind === "validation");
  const planningLinks = links.filter((link) => link.provenance_kind === "advisory_planning");
  const hasApprovedNeed = validationLinks.some((link) =>
    link.source_type === "community_need"
    && link.details?.approval_status === "approved"
  );
  const totalLinks  = links.length;
  const linkPathMet = validationLinks.length >= 2 && hasApprovedNeed;

  const showAddButton = canRecord ?? ["draft", "submitted", "revisions_requested"].includes(proposalStatus);

  // ── Header ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground font-medium text-sm">Community Validation</p>
        {validatedFlag ? (
          <Badge className="bg-success/10 text-success border-success/20 border text-xs">
            <CheckCircle className="w-3 h-3 mr-1" /> Evidence-backed
          </Badge>
        ) : (
          <Badge className="bg-warning/10 text-warning border-warning/20 border text-xs">
            Pending
          </Badge>
        )}
      </div>

      {!validatedFlag && (
        <div className="p-3 rounded-xl bg-warning/5 border border-warning/20 space-y-2">
          <div className="flex gap-2.5">
            <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Phase II requires evidence-backed validation before pre-screening.
              Either path below counts:
            </p>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 pl-7">
            <li>
              <strong className="text-foreground">Link records</strong> (preferred):
              {" "}≥ 2 human-reviewed records from the system, including one
              Captain-approved need for this barangay.
              <span className="ml-1 text-[11px]">({validationLinks.length}/2 qualifying)</span>
            </li>
            <li>
              <strong className="text-foreground">Or upload evidence</strong>:
              ≥ {MIN_EVIDENCE} file + ≥ {MIN_STAKEHOLDERS} stakeholders in a validation event below.
            </li>
          </ul>
        </div>
      )}

      {/* ── Linked Records (primary path) ───────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
            <LinkIcon className="w-3 h-3" /> Linked Records ({totalLinks})
            {linkPathMet && (
              <Badge className="bg-success/10 text-success border-success/20 border text-[10px] font-normal ml-1">
                threshold met
              </Badge>
            )}
          </p>
          {(canRecord ?? ["draft", "submitted", "revisions_requested"].includes(proposalStatus)) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="h-7 text-xs gap-1.5"
            >
              <Plus className="w-3 h-3" /> Link record
            </Button>
          )}
        </div>
        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No records linked. Cite at least 2 human-reviewed records — approved
            community needs, published surveys, field observations, or completed
            aggregate profiling evidence — to satisfy this validation path.
          </p>
        ) : (
          <div className="space-y-2">
            {links.map((l) => (
              <LinkedRecordCard
                key={l.id}
                record={l}
                proposalId={proposalId}
                onRemoved={async () => { await load(); onChangeRef.current?.(); }}
              />
            ))}
          </div>
        )}
        {planningLinks.length > 0 && (
          <p className="text-[11px] text-info">
            {planningLinks.length} recommendation-derived source{planningLinks.length === 1 ? " is" : "s are"} retained as planning provenance and excluded from the human-validation threshold.
          </p>
        )}
      </div>

      <ValidationLinkPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        proposalId={proposalId}
        proposalBarangayId={proposalBarangayId ?? null}
        onLinked={async () => { await load(); onChangeRef.current?.(); }}
      />

      {/* ── Supplementary: uploaded-evidence events ─────────────────────── */}
      <div className="pt-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
          Supplementary Evidence Uploads
        </p>

      {/* ── List of recorded events ─────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading validations…
        </div>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          No validation events recorded yet.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((v) => (
            <ValidationEventCard
              key={v.id}
              proposalId={proposalId}
              validation={v}
              onDeleted={async () => { await load(); onChangeRef.current?.(); }}
              onEvidenceChanged={async () => { await load(); onChangeRef.current?.(); }}
            />
          ))}
        </div>
      )}

      {/* ── Add new event ──────────────────────────────────────────────── */}
      {showAddButton && !adding && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
          className="gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Record new validation
        </Button>
      )}
      {adding && (
        <NewValidationForm
          proposalId={proposalId}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await load();
            onChangeRef.current?.();
          }}
        />
      )}
      </div>
    </div>
  );
}

// ─── Existing validation event card ────────────────────────────────────────

function ValidationEventCard({
  proposalId, validation, onDeleted, onEvidenceChanged,
}: {
  proposalId:        string;
  validation:        Validation;
  onDeleted:         () => Promise<void>;
  onEvidenceChanged: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const v = validation;
  const hasMinStakeholders = v.stakeholders.length >= MIN_STAKEHOLDERS;
  const hasMinEvidence     = v.evidence.length     >= MIN_EVIDENCE;
  const meetsThreshold     = hasMinStakeholders && hasMinEvidence;

  async function handleDelete() {
    if (!confirm("Delete this validation event? This cannot be undone.")) return;
    setDeleting(true);
    const res = await fetch(`/api/proposals/${proposalId}/validations/${v.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to delete.");
      return;
    }
    toast.success("Validation event deleted.");
    await onDeleted();
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/proposals/${proposalId}/validations/${v.id}/evidence`,
        { method: "POST", body: form },
      );
      if (res.ok) ok += 1;
      else {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? `Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (ok > 0) {
      toast.success(`Uploaded ${ok} file${ok === 1 ? "" : "s"}.`);
      await onEvidenceChanged();
    }
  }

  async function deleteEvidence(eid: string) {
    if (!confirm("Remove this evidence file?")) return;
    const res = await fetch(
      `/api/proposals/${proposalId}/validations/${v.id}/evidence?eid=${eid}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to remove file.");
      return;
    }
    toast.success("Evidence removed.");
    await onEvidenceChanged();
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2.5 ${meetsThreshold ? "border-success/30 bg-success/5" : "border-border bg-surface"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            {METHOD_LABELS[v.method]} · {new Date(v.date_conducted).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          {v.recorder_name && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Recorded by {v.recorder_name}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-muted-foreground hover:text-danger p-1 rounded"
          title="Delete this validation event"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Summary */}
      <p className="text-xs text-foreground/80 whitespace-pre-wrap italic">
        “{v.summary}”
      </p>

      {/* Stakeholders */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
          <Users className="w-3 h-3" /> Stakeholders ({v.stakeholders.length})
          {!hasMinStakeholders && (
            <span className="text-warning normal-case font-normal lowercase">
              · need {MIN_STAKEHOLDERS - v.stakeholders.length} more
            </span>
          )}
        </p>
        <ul className="text-xs space-y-0.5">
          {v.stakeholders.map((s, i) => (
            <li key={s.id ?? i} className="flex gap-2 text-foreground/80">
              <span>•</span>
              <span>
                {s.stakeholder_name}
                {s.role && <span className="text-muted-foreground"> — {s.role}</span>}
                {!s.present && <span className="text-muted-foreground italic"> (absent)</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Evidence files */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
          <Paperclip className="w-3 h-3" /> Evidence ({v.evidence.length})
          {!hasMinEvidence && (
            <span className="text-warning normal-case font-normal lowercase">
              · need {MIN_EVIDENCE - v.evidence.length} more
            </span>
          )}
        </p>
        {v.evidence.length > 0 && (
          <ul className="text-xs space-y-1 mb-2">
            {v.evidence.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded bg-muted/30">
                <span className="min-w-0 flex-1 truncate text-foreground/80">{e.file_name}</span>
                <span className="flex items-center gap-1 shrink-0">
                  {e.url && (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary p-0.5 rounded"
                      title="Open file"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteEvidence(e.id)}
                    className="text-muted-foreground hover:text-danger p-0.5 rounded"
                    title="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="h-7 text-xs gap-1.5"
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add evidence
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,application/pdf,audio/*"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {!meetsThreshold && (
        <p className="text-[11px] text-warning flex items-center gap-1 pt-1 border-t border-warning/20">
          <AlertCircle className="w-3 h-3" />
          Add the missing items above so this validation counts toward pre-screening.
        </p>
      )}
    </div>
  );
}

// ─── New validation form ───────────────────────────────────────────────────

function NewValidationForm({
  proposalId, onCancel, onSaved,
}: {
  proposalId: string;
  onCancel:   () => void;
  onSaved:    () => Promise<void>;
}) {
  const [method, setMethod]       = useState<Method>("fgd");
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary]     = useState("");
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([
    { stakeholder_name: "", role: "", present: true },
    { stakeholder_name: "", role: "", present: true },
    { stakeholder_name: "", role: "", present: true },
  ]);
  const [saving, setSaving]       = useState(false);

  function updateStakeholder(idx: number, patch: Partial<Stakeholder>) {
    setStakeholders((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }
  function addStakeholder() {
    setStakeholders((prev) => [...prev, { stakeholder_name: "", role: "", present: true }]);
  }
  function removeStakeholder(idx: number) {
    setStakeholders((prev) => prev.filter((_, i) => i !== idx));
  }

  const namedCount = stakeholders.filter((s) => s.stakeholder_name.trim().length >= 2).length;

  async function handleSubmit() {
    if (summary.trim().length < MIN_SUMMARY_CHARS) {
      toast.error(`Summary must describe the consultation (min ${MIN_SUMMARY_CHARS} characters).`);
      return;
    }
    if (namedCount < MIN_STAKEHOLDERS) {
      toast.error(`List at least ${MIN_STAKEHOLDERS} named stakeholders.`);
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/proposals/${proposalId}/validations`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        method,
        date_conducted: date,
        summary:        summary.trim(),
        stakeholders:   stakeholders
          .map((s) => ({ name: s.stakeholder_name.trim(), role: s.role?.trim() || null, present: s.present }))
          .filter((s) => s.name.length >= 2),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to record validation.");
      return;
    }
    toast.success("Validation event recorded. Upload evidence files next.");
    await onSaved();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">New Validation Event</p>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="cv-method" className="text-xs">Method</Label>
          <select
            id="cv-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
            className="w-full h-9 px-3 rounded-xl border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
              <option key={m} value={m}>{METHOD_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cv-date" className="text-xs">Date conducted</Label>
          <Input
            id="cv-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 focus-visible:ring-primary/30"
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs flex items-center justify-between">
          <span>Stakeholders ({namedCount} named, min {MIN_STAKEHOLDERS})</span>
          <button
            type="button"
            onClick={addStakeholder}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </Label>
        <div className="space-y-1.5">
          {stakeholders.map((s, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                placeholder="Name"
                value={s.stakeholder_name}
                onChange={(e) => updateStakeholder(i, { stakeholder_name: e.target.value })}
                className="h-8 text-sm flex-1"
              />
              <Input
                placeholder="Role / affiliation"
                value={s.role ?? ""}
                onChange={(e) => updateStakeholder(i, { role: e.target.value })}
                className="h-8 text-sm flex-1"
              />
              {stakeholders.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStakeholder(i)}
                  className="text-muted-foreground hover:text-danger p-1"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="cv-summary" className="text-xs">
          Summary of feedback <span className="text-danger">*</span>
        </Label>
        <Textarea
          id="cv-summary"
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What did the community confirm, challenge, or ask to change? Did the consultation shape any objectives?"
          className="focus-visible:ring-primary/30 resize-none text-sm"
        />
        <p className="text-[11px] text-muted-foreground">{summary.trim().length} / {MIN_SUMMARY_CHARS} min characters</p>
      </div>

      <div className="rounded-lg bg-info/5 border border-info/20 p-2 flex gap-2 items-start">
        <FileText className="w-3.5 h-3.5 text-info shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">
          You&apos;ll upload FGD minutes / signed attendance / photos / etc. after saving — at least
          {" "}{MIN_EVIDENCE} file is required for this validation to count toward pre-screening.
        </p>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={saving}
          className="bg-primary hover:bg-primary-dark text-white"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save & Continue"}
        </Button>
      </div>
    </div>
  );
}
