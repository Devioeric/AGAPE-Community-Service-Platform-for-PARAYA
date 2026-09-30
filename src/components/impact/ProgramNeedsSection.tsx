"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Chip, NeedStatusBadge, sentenceCase } from "@/components/impact/ImpactUi";
import { NEED_CATEGORIES, type ProgramNeed } from "@/lib/impact/outcomes";

type NeedOption = { id: string; title: string; category: string; priority: string | null; barangay_id: string | null };
const STATUSES = ["identified", "in_progress", "addressed"] as const;

async function send(url: string, init: RequestInit, fallback: string) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? fallback);
}

/** Step 1: the approved community needs a program answers, with linking, status, and unlinking. */
export function ProgramNeedsSection({ programId, barangayId, barangayName, needs, canManage, linkOpen, onLinkOpenChange, onChanged }: {
  programId: string;
  barangayId: string | null;
  barangayName: string | null;
  needs: ProgramNeed[];
  canManage: boolean;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [options, setOptions] = useState<NeedOption[] | null>(null);
  const [selected, setSelected] = useState("");
  const [coverage, setCoverage] = useState<"full" | "partial">("partial");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Load the barangay's approved needs each time the dialog opens.
  useEffect(() => {
    if (!linkOpen || !barangayId) return;
    let cancelled = false;
    setOptions(null); setSelected(""); setCoverage("partial");
    fetch("/api/community-needs?status=approved", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((payload) => {
        if (cancelled) return;
        const linked = new Set(needs.map((need) => need.needId));
        setOptions(((payload.data ?? []) as NeedOption[]).filter((need) => need.barangay_id === barangayId && !linked.has(need.id)));
      })
      .catch(() => { if (!cancelled) { setOptions([]); toast.error("Approved community needs are temporarily unavailable."); } });
    return () => { cancelled = true; };
  }, [linkOpen, barangayId, needs]);

  const link = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await send(`/api/impact/programs/${programId}/needs`, { method: "POST", body: JSON.stringify({ need_id: selected, intended_coverage: coverage }) }, "The need could not be linked.");
      toast.success("Need linked to this program.");
      onLinkOpenChange(false); onChanged();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "The need could not be linked."); }
    finally { setSaving(false); }
  };

  const setStatus = async (need: ProgramNeed, status: string) => {
    setBusy(need.linkId);
    try {
      await send(`/api/impact/needs/${need.needId}/status`, { method: "POST", body: JSON.stringify({ program_id: programId, expected_status: need.status, status }) }, "The need status could not be updated.");
      toast.success(`Marked "${sentenceCase(status)}".`); onChanged();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "The need status could not be updated."); }
    finally { setBusy(null); }
  };

  const unlink = async (need: ProgramNeed) => {
    setBusy(need.linkId);
    try {
      await send(`/api/impact/programs/${programId}/needs/${need.linkId}`, { method: "DELETE" }, "The need could not be unlinked.");
      toast.success("Need unlinked."); onChanged();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "The need could not be unlinked."); }
    finally { setBusy(null); }
  };

  const grouped = (options ?? []).reduce<Record<string, NeedOption[]>>((groups, need) => {
    (groups[need.category] ??= []).push(need);
    return groups;
  }, {});
  const categoryOrder = [...NEED_CATEGORIES, ...Object.keys(grouped).filter((category) => !(NEED_CATEGORIES as readonly string[]).includes(category))];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <h3 className="font-heading text-base font-semibold text-foreground">Needs this program answers</h3>
          <p className="text-xs text-muted-foreground">Approved community needs of {barangayName ?? "the program's barangay"} that this program responds to.</p>
        </div>
        {canManage && barangayId && (
          <Button size="sm" variant="outline" onClick={() => onLinkOpenChange(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Link a need</Button>
        )}
      </div>

      {needs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {barangayId
            ? "No community need is linked yet. Link the approved need this program responds to, so its results count toward that need."
            : "This program has no barangay, so it cannot be linked to a community need."}
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {needs.map((need) => (
            <li key={need.linkId} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0 space-y-1.5">
                <p className="font-medium text-foreground">{need.title}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <NeedStatusBadge status={need.status} />
                  <Chip>{sentenceCase(need.category)}</Chip>
                  <Chip>{need.coverage === "full" ? "Full coverage" : "Partial coverage"}</Chip>
                  {need.priority && <Chip>{sentenceCase(need.priority)} priority</Chip>}
                  <span className="text-xs text-muted-foreground">{need.source === "proposal" ? "From the approved proposal" : "Linked here"}</span>
                </div>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger disabled={busy === need.linkId} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      {busy === need.linkId ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Update status<ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {STATUSES.filter((status) => status !== need.status).map((status) => (
                        <DropdownMenuItem key={status} onClick={() => void setStatus(need, status)}>Mark {sentenceCase(status).toLowerCase()}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {need.source === "manual" && (
                    <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busy === need.linkId} onClick={() => void unlink(need)}>Unlink</Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <Dialog open={linkOpen} onOpenChange={(open) => { if (!saving) onLinkOpenChange(open); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">Link a community need</DialogTitle>
              <DialogDescription>Choose the approved need of {barangayName ?? "this barangay"} that this program responds to.</DialogDescription>
            </DialogHeader>
            {options === null ? (
              <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading approved needs…</p>
            ) : options.length === 0 ? (
              <div className="space-y-2 py-2 text-sm text-muted-foreground">
                <p>{needs.length > 0 ? "Every approved need of this barangay is already linked." : `${barangayName ?? "This barangay"} has no approved community needs yet.`}</p>
                <Link href="/officer/community-needs" prefetch={false} className="font-medium text-primary underline-offset-4 hover:underline">Open Community Needs →</Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="link-need">Community need <span className="text-danger">*</span></Label>
                  <select id="link-need" value={selected} onChange={(event) => setSelected(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="">Select an approved need</option>
                    {categoryOrder.filter((category) => grouped[category]?.length).map((category) => (
                      <optgroup key={category} label={sentenceCase(category)}>
                        {grouped[category].map((need) => (
                          <option key={need.id} value={need.id}>{need.title}{need.priority ? ` · ${sentenceCase(need.priority)} priority` : ""}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-foreground">How much of the need does the program cover?</legend>
                  {([["partial", "Partial", "It helps with part of the need."], ["full", "Full", "It is meant to meet the whole need."]] as const).map(([value, label, hint]) => (
                    <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${coverage === value ? "border-primary/50 bg-surface-alt/60" : "border-border"}`}>
                      <input type="radio" name="need-coverage" className="mt-0.5" checked={coverage === value} onChange={() => setCoverage(value)} />
                      <span><span className="font-medium text-foreground">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
                    </label>
                  ))}
                </fieldset>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" disabled={saving} onClick={() => onLinkOpenChange(false)}>Cancel</Button>
              <Button disabled={saving || !selected} onClick={() => void link()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Link need
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
