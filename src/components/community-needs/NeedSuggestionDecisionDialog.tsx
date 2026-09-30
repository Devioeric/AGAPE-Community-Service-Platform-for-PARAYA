"use client";

import { useEffect, useState } from "react";
import { Lightbulb, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NeedSuggestion } from "@/lib/community-needs/need-suggestions";

type DecisionMode = "accept" | "dismiss";

const categories = ["health", "livelihood", "education", "infrastructure", "environment"] as const;
const priorities = ["low", "medium", "high", "critical"] as const;
const dismissalReasons = [
  ["not_a_priority", "Not a current priority"],
  ["already_addressed", "Already addressed"],
  ["data_quality_concern", "Data-quality concern"],
  ["outside_paraya_scope", "Outside PARAYA scope"],
  ["duplicate_of_existing_need", "Duplicate of an existing need"],
  ["other", "Other"],
] as const;

const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function NeedSuggestionDecisionDialog({
  suggestion,
  mode,
  onClose,
  onCompleted,
}: {
  suggestion: NeedSuggestion | null;
  mode: DecisionMode;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("infrastructure");
  const [priority, setPriority] = useState<(typeof priorities)[number]>("medium");
  const [reason, setReason] = useState<(typeof dismissalReasons)[number][0]>("not_a_priority");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!suggestion) return;
    setTitle(suggestion.title);
    setDescription(suggestion.description);
    setCategory(suggestion.category);
    setPriority(suggestion.priority);
    setReason("not_a_priority");
    setNote("");
  }, [suggestion]);

  async function submit() {
    if (!suggestion || submitting) return;
    if (mode === "accept" && (title.trim().length < 3 || description.trim().length < 10)) return;
    if (mode === "dismiss" && reason === "other" && note.trim().length < 3) return;
    setSubmitting(true);
    try {
      // Deliberately send only the allow-listed decision fields. Evidence and
      // policy are rebuilt and validated by the server from the frozen snapshot.
      const body = mode === "accept"
        ? {
            cycle_id: suggestion.cycle.id,
            indicator_code: suggestion.code,
            decision: "accept" as const,
            need: {
              title: title.trim(),
              description: description.trim(),
              category,
              priority,
            },
          }
        : {
            cycle_id: suggestion.cycle.id,
            indicator_code: suggestion.code,
            decision: "dismiss" as const,
            reason_code: reason,
            ...(note.trim() ? { note: note.trim() } : {}),
          };
      const response = await fetch("/api/need-suggestions/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        const message = payload.error ?? "Unable to record this decision.";
        // A concurrent review or a newly generated snapshot can make the
        // displayed signal stale. Close and refresh the panel so the Officer
        // does not keep acting on a decision the server has rejected.
        if (response.status === 409 || response.status === 422) {
          toast.error(message);
          onClose();
          onCompleted();
          return;
        }
        throw new Error(message);
      }
      toast.success(mode === "accept" ? "Suggested need submitted for PARAYA review" : "Suggestion dismissed");
      onClose();
      onCompleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to record this decision.");
    } finally {
      setSubmitting(false);
    }
  }

  const accepting = mode === "accept";
  return (
    <Dialog open={Boolean(suggestion)} onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            {accepting ? <Lightbulb className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-danger" />}
            {accepting ? "Accept suggested need" : "Dismiss suggestion"}
          </DialogTitle>
          <DialogDescription>
            {accepting
              ? "Review the rule-based suggestion before submitting it for normal PARAYA Officer review."
              : "Record why this data-derived suggestion should not be pursued for this profiling cycle."}
          </DialogDescription>
        </DialogHeader>
        {suggestion && accepting && (
          <div className="space-y-3 py-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{suggestion.category}</Badge>
              <Badge variant="outline">Suggested priority: {suggestion.priority}</Badge>
            </div>
            <div className="space-y-1.5"><Label htmlFor="suggestion-title">Title</Label><Input id="suggestion-title" value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="suggestion-description">Description</Label><Textarea id="suggestion-description" value={description} maxLength={2000} rows={5} onChange={(event) => setDescription(event.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">Category<select className={selectClass} value={category} onChange={(event) => setCategory(event.target.value as (typeof categories)[number])}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1.5 text-sm font-medium">Priority<select className={selectClass} value={priority} onChange={(event) => setPriority(event.target.value as (typeof priorities)[number])}>{priorities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">Evidence from the approved profiling snapshot: {suggestion.description.split(" Source:")[0]}</div>
          </div>
        )}
        {suggestion && !accepting && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{suggestion.title}</span> — this decision applies to the current profiling cycle.</p>
            <label className="space-y-1.5 text-sm font-medium">Reason<select className={selectClass} value={reason} onChange={(event) => setReason(event.target.value as (typeof dismissalReasons)[number][0])}>{dismissalReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="space-y-1.5"><Label htmlFor="suggestion-dismiss-note">Note{reason === "other" ? <span className="ml-1 text-danger">*</span> : null}</Label><Textarea id="suggestion-dismiss-note" value={note} maxLength={500} rows={4} onChange={(event) => setNote(event.target.value)} placeholder="Optional context for the audit record." /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={submitting || (accepting ? title.trim().length < 3 || description.trim().length < 10 : reason === "other" && note.trim().length < 3)} className={accepting ? "bg-primary text-primary-foreground" : "bg-danger text-white hover:bg-danger/90"}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{accepting ? "Submit for review" : "Dismiss suggestion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
