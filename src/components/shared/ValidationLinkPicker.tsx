"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, ClipboardList, BarChart3, Eye, Home, CheckCircle, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// Picker for linking an existing community-engagement record to a proposal as
// Phase II validation. Source-type tabs along the top; per-type list below;
// rationale required before save.

type SourceType = "community_need" | "survey" | "field_observation" | "profiling_evidence_snapshot";

interface CommunityNeed {
  id:              string;
  title:           string;
  category:        string;
  sitio:           string | null;
  approval_status: string;
  barangays:       { name: string } | null;
}

interface Survey {
  id:        string;
  title:     string;
  status:    string;
  barangays: { name: string } | null;
}

interface FieldObservation {
  id:               string;
  observation:      string;
  observation_date: string;
  category:         string | null;
  sitio:            string | null;
  barangays:        { name: string } | null;
}

interface ProfilingEvidenceSnapshot {
  id: string;
  generated_at: string;
  profiling_cycles: { name?: string; barangays?: { name?: string } | null } | null;
  household_number?: string;
  head_of_household?: string | null;
  sitio?: string | null;
  barangays?: { name: string } | null;
}

type Candidate = {
  id:    string;
  label: string;
  meta:  string;
};

interface Props {
  open:                boolean;
  onOpenChange:        (open: boolean) => void;
  proposalId:          string;
  proposalBarangayId:  string | null;
  onLinked:            () => Promise<void>;
}

const SOURCE_META: Record<SourceType, { label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = {
  community_need:    { label: "Community Needs",    icon: ClipboardList, hint: "Captain-approved needs are strongest evidence." },
  survey:            { label: "Surveys",            icon: BarChart3,    hint: "Cite a survey whose responses informed the objectives." },
  field_observation: { label: "Field Observations", icon: Eye,          hint: "Open-ended notes from community immersion." },
  profiling_evidence_snapshot: { label: "Approved Profile Evidence", icon: Home, hint: "Completed, de-identified profiling-cycle evidence." },
};

export function ValidationLinkPicker({
  open, onOpenChange, proposalId, proposalBarangayId, onLinked,
}: Props) {
  const [sourceType, setSourceType] = useState<SourceType>("community_need");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState("");
  const [picked, setPicked]         = useState<Candidate | null>(null);
  const [rationale, setRationale]   = useState("");
  const [saving, setSaving]         = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSourceType("community_need");
      setSearch("");
      setPicked(null);
      setRationale("");
    }
  }, [open]);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setPicked(null);
    setCandidates([]);
    try {
      let url = "";
      switch (sourceType) {
        case "community_need":
          url = "/api/community-needs?status=all"; // get all; we'll badge approved ones
          break;
        case "survey":
          url = "/api/surveys";
          break;
        case "field_observation":
          url = proposalBarangayId
            ? `/api/field-observations?barangay_id=${proposalBarangayId}`
            : "/api/field-observations";
          break;
        case "profiling_evidence_snapshot":
          url = proposalBarangayId ? `/api/profiling/evidence?barangay_id=${proposalBarangayId}` : "/api/profiling/evidence";
          break;
      }
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "Failed to load candidates.");
        setLoading(false);
        return;
      }
      const data = ((await res.json()).data ?? []) as unknown[];
      const mapped: Candidate[] = data.map((row) => {
        switch (sourceType) {
          case "community_need": {
            const r = row as CommunityNeed;
            const brgy   = r.barangays?.name ?? "—";
            const sitio  = r.sitio ? ` · ${r.sitio}` : "";
            const status = r.approval_status === "approved" ? " · ✓ approved" : ` · ${r.approval_status}`;
            return {
              id:    r.id,
              label: r.title,
              meta:  `${r.category} · ${brgy}${sitio}${status}`,
            };
          }
          case "survey": {
            const r = row as Survey;
            return {
              id:    r.id,
              label: r.title,
              meta:  `${r.status}${r.barangays?.name ? ` · ${r.barangays.name}` : ""}`,
            };
          }
          case "field_observation": {
            const r = row as FieldObservation;
            const text = r.observation.length > 80 ? r.observation.slice(0, 80) + "…" : r.observation;
            return {
              id:    r.id,
              label: text,
              meta:  `${r.observation_date}${r.category ? ` · ${r.category}` : ""}${r.sitio ? ` · ${r.sitio}` : ""}`,
            };
          }
          case "profiling_evidence_snapshot": {
            const snapshot = row as ProfilingEvidenceSnapshot;
            const r = { ...snapshot, household_number: snapshot.profiling_cycles?.name ?? "Completed profiling cycle", head_of_household: null, sitio: null, barangays: snapshot.profiling_cycles?.barangays ?? null };
            return {
              id:    r.id,
              label: `${r.household_number}${r.head_of_household ? ` · ${r.head_of_household}` : ""}`,
              meta:  `${r.barangays?.name ?? "—"}${r.sitio ? ` · ${r.sitio}` : ""}`,
            };
          }
        }
      });

      // Best-effort filter by the proposal's barangay for community_need and
      // survey (those APIs don't take a barangay_id filter on the GET).
      let filtered = mapped;
      if (proposalBarangayId && (sourceType === "community_need" || sourceType === "survey")) {
        const brgyId = proposalBarangayId;
        filtered = mapped.filter((c, i) => {
          const orig = data[i] as { barangay_id?: string };
          return !orig.barangay_id || orig.barangay_id === brgyId;
        });
      }
      setCandidates(filtered);
    } finally {
      setLoading(false);
    }
  }, [sourceType, proposalBarangayId]);

  useEffect(() => {
    if (open) fetchCandidates();
  }, [open, fetchCandidates]);

  const visible = search.trim().length === 0
    ? candidates
    : candidates.filter((c) => {
        const q = search.toLowerCase();
        return c.label.toLowerCase().includes(q) || c.meta.toLowerCase().includes(q);
      });

  async function handleSave() {
    if (!picked) {
      toast.error("Select a record first.");
      return;
    }
    if (rationale.trim().length < 10) {
      toast.error("Explain how this record informed the proposal (min 10 characters).");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/proposals/${proposalId}/validation-links`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        source_type: sourceType,
        source_id:   picked.id,
        rationale:   rationale.trim(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to link.");
      return;
    }
    toast.success("Record linked.");
    onOpenChange(false);
    await onLinked();
  }

  const meta = SOURCE_META[sourceType];
  const Icon = meta.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-heading flex items-center gap-2">
            <Icon className="w-4 h-4 text-primary" />
            Link a {meta.label.toLowerCase().replace(/s$/, "")} as validation
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* Source-type tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-muted/40">
            {(Object.keys(SOURCE_META) as SourceType[]).map((t) => {
              const m = SOURCE_META[t];
              const active = sourceType === t;
              const TIcon = m.icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSourceType(t)}
                  className={`flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <TIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Filter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 focus-visible:ring-primary/30"
            />
          </div>

          {/* Candidate list */}
          <div className="border border-border rounded-xl divide-y divide-border max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
              </div>
            ) : visible.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-6">
                No {meta.label.toLowerCase()} found
                {proposalBarangayId ? " in this barangay" : ""}.
              </p>
            ) : (
              visible.map((c) => {
                const sel = picked?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPicked(c)}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors ${
                      sel ? "bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{c.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{c.meta}</p>
                    </div>
                    {sel && <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Rationale */}
          {picked && (
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="link-rationale" className="text-xs">
                How did this {meta.label.toLowerCase().replace(/s$/, "")} inform the proposal? <span className="text-danger">*</span>
              </Label>
              <Textarea
                id="link-rationale"
                rows={3}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="e.g. Objective 2 directly addresses the flooding concern surfaced in this record."
                className="focus-visible:ring-primary/30 resize-none text-sm"
              />
              <p className="text-[11px] text-muted-foreground">{rationale.trim().length} / 10 min characters</p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!picked || saving}
            className="bg-primary hover:bg-primary-dark text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <><CheckCircle className="w-4 h-4 mr-1.5" /> Link as validation</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface LinkedRecord {
  id:          string;
  source_type: SourceType | "survey_response";
  source_id:   string;
  rationale:   string;
  linker_name: string | null;
  created_at:  string;
  details:     Record<string, unknown> | null;
}

// Renders one linked record as a compact card.
export function LinkedRecordCard({
  record, proposalId, onRemoved,
}: {
  record:     LinkedRecord;
  proposalId: string;
  onRemoved:  () => Promise<void>;
}) {
  void proposalId;
  void onRemoved;
  // SOURCE_META covers the 4 types officers can pick. survey_response can
  // exist in the DB but isn't surface-able from the picker — fall back gracefully.
  const meta = SOURCE_META[record.source_type as keyof typeof SOURCE_META]
            ?? { label: "Linked Record", icon: LinkIcon, hint: "" };
  const Icon = meta.icon;
  const details = record.details ?? {};

  let title = "Linked record";
  let secondaryLine = "";
  let approvedBadge: React.ReactNode = null;

  const t = record.source_type as string;
  if (t === "community_need") {
    title = (details.title as string) ?? "Untitled need";
    const brgy  = (details.barangays as { name?: string } | null)?.name ?? "";
    const sitio = (details.sitio as string) ?? "";
    const cat   = (details.category as string) ?? "";
    secondaryLine = [cat, brgy, sitio].filter(Boolean).join(" · ");
    if ((details.approval_status as string) === "approved") {
      approvedBadge = (
        <Badge className="bg-success/10 text-success border-success/20 border text-[10px] font-normal">
          Captain-approved
        </Badge>
      );
    }
  } else if (t === "survey") {
    title = (details.title as string) ?? "Survey";
    const brgy = (details.barangays as { name?: string } | null)?.name ?? "";
    const status = (details.status as string) ?? "";
    secondaryLine = [status, brgy].filter(Boolean).join(" · ");
  } else if (t === "field_observation") {
    const obs = (details.observation as string) ?? "";
    title = obs.length > 80 ? obs.slice(0, 80) + "…" : obs;
    const date = (details.observation_date as string) ?? "";
    const cat  = (details.category as string) ?? "";
    const sitio = (details.sitio as string) ?? "";
    secondaryLine = [date, cat, sitio].filter(Boolean).join(" · ");
  } else if (t === "profiling_evidence_snapshot") {
    const cycle = details.profiling_cycles as { name?: string; barangays?: { name?: string } | null } | null;
    const hh = cycle?.name ?? "";
    const head = "";
    title = [hh, head].filter(Boolean).join(" · ") || "Household";
    const brgy = cycle?.barangays?.name ?? "";
    const sitio = (details.generated_at as string) ?? "";
    secondaryLine = [brgy, sitio].filter(Boolean).join(" · ");
  } else if (t === "survey_response") {
    title = "Survey response";
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <div className="rounded-lg bg-primary/10 p-1.5 shrink-0">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-medium text-foreground line-clamp-1">{title}</p>
              {approvedBadge}
            </div>
            {secondaryLine && (
              <p className="text-[11px] text-muted-foreground truncate">{secondaryLine}</p>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-foreground/80 italic pl-7">→ {record.rationale}</p>
      {record.linker_name && (
        <p className="text-[10px] text-muted-foreground pl-7">Linked by {record.linker_name}</p>
      )}
    </div>
  );
}
