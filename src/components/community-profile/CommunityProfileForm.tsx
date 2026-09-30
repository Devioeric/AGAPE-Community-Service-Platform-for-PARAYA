"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROFILE_INDICATORS, PROFILE_SECTIONS, type ProfileIndicator } from "@/lib/community-profile/catalog";
import { communityProfileInputSchema, type CommunityProfileData, type IndicatorValue } from "@/lib/community-profile/schema";
import { indicatorTotal } from "@/lib/community-profile/stats";
import type { ProfileDTO } from "./CommunityProfileView";
import { MultipleAnswersPill, ProfileRecordHeader, ProfileSectionTabs } from "./ProfileUi";

type Props = { barangayId: string; barangayName: string; initial: ProfileDTO | null; onSaved: () => void; onCancel: () => void };
type Draft = {
  coverage: string; source_title: string; collected_on: string;
  respondent_households: number | null; individuals: number | null; notes: string;
  data: CommunityProfileData;
};

const FIELD_LABELS: Record<string, string> = {
  coverage: "Coverage", source_title: "Source", collected_on: "Collected on",
  respondent_households: "Households surveyed", individuals: "Individuals", notes: "Data notes",
};

function toDraft(initial: ProfileDTO | null): Draft {
  return {
    coverage: initial?.coverage ?? "",
    source_title: initial?.source_title ?? "PARAYA community profiling report",
    collected_on: initial?.collected_on ?? "",
    respondent_households: initial?.respondent_households ?? null,
    individuals: initial?.individuals ?? null,
    notes: initial?.notes ?? "",
    data: structuredClone(initial?.data ?? {}),
  };
}

/** An empty box is "not reported" (null); only whole, non-negative numbers are kept. */
function parseCount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Math.trunc(Number(raw));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function hasContent(value: IndicatorValue | undefined): boolean {
  return Boolean(value && (value.note?.trim() || Object.values(value.counts).some((count) => typeof count === "number")));
}

/** "data.sex.counts.female" → "Sex › Female". */
function issueLabel(path: string): string {
  const [head, indicatorKey, , categoryKey] = path.split(".");
  if (head !== "data") return FIELD_LABELS[head] ?? head;
  const indicator = PROFILE_INDICATORS.find((item) => item.key === indicatorKey);
  const category = indicator?.categories.find((item) => item.key === categoryKey);
  return [indicator?.label ?? indicatorKey, category?.label].filter(Boolean).join(" › ");
}

function IndicatorEditor({ indicator, value, onCount, onNote }: {
  indicator: ProfileIndicator;
  value: IndicatorValue | undefined;
  onCount: (category: string, raw: string) => void;
  onNote: (note: string) => void;
}) {
  const total = indicatorTotal(value);
  return (
    <fieldset className="mb-4 break-inside-avoid rounded-lg border border-border bg-background p-4">
      <legend className="sr-only">{indicator.label}</legend>
      <div className="mb-3 flex items-start justify-between gap-3">
        <p aria-hidden="true" className="text-sm font-semibold text-foreground">{indicator.label}</p>
        {indicator.response === "multiple" && <MultipleAnswersPill />}
      </div>
      <div className="space-y-1.5">
        {indicator.categories.map((category) => (
          <label key={category.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 text-foreground">{category.label}</span>
            <Input
              type="number" min={0} step={1} inputMode="numeric"
              aria-label={`${indicator.label}: ${category.label}`}
              className="h-8 w-20 shrink-0 text-right tabular-nums"
              value={value?.counts[category.key] ?? ""}
              onChange={(event) => onCount(category.key, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-xs">
        <span className="text-muted-foreground">{indicator.response === "multiple" ? "Total answers" : `Total ${indicator.unit}`}</span>
        <span className="font-semibold text-foreground tabular-nums">{total ?? "—"}</span>
      </div>
      <Input
        aria-label={`${indicator.label}: note`}
        className="mt-2 h-8 text-xs"
        placeholder="Note about this table (optional)"
        value={value?.note ?? ""}
        onChange={(event) => onNote(event.target.value)}
      />
    </fieldset>
  );
}

export function CommunityProfileForm({ barangayId, barangayName, initial, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [pristine] = useState(() => JSON.stringify(toDraft(initial)));
  const [section, setSection] = useState(PROFILE_SECTIONS[0].key);
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty = JSON.stringify(draft) !== pristine;

  const updateIndicator = (key: string, change: (current: IndicatorValue) => IndicatorValue) =>
    setDraft((current) => ({ ...current, data: { ...current.data, [key]: change(current.data[key] ?? { counts: {} }) } }));

  const payload = useMemo(() => ({
    coverage: draft.coverage,
    source_title: draft.source_title,
    collected_on: draft.collected_on || null,
    respondent_households: draft.respondent_households,
    individuals: draft.individuals,
    notes: draft.notes,
    // Tables with nothing entered are "not reported" and are not stored.
    data: Object.fromEntries(Object.entries(draft.data).filter(([, value]) => hasContent(value))),
    expected_updated_at: initial?.updated_at ?? null,
  }), [draft, initial]);

  async function save() {
    const parsed = communityProfileInputSchema.safeParse(payload);
    if (!parsed.success) {
      setIssues(parsed.error.issues.slice(0, 12).map((issue) => `${issueLabel(issue.path.join("."))}: ${issue.message}`));
      return;
    }
    setSaving(true); setIssues([]); setConflict(false);
    try {
      const response = await fetch(`/api/community-profiles/${barangayId}`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) { setConflict(true); setIssues([result.error ?? "This profile changed. Reload before saving."]); return; }
      if (!response.ok) {
        setIssues(result.issues?.map((item: { path: string; message: string }) => `${issueLabel(item.path)}: ${item.message}`) ?? [result.error ?? "The profile could not be saved."]);
        return;
      }
      toast.success("Community profile saved");
      onSaved();
    } catch {
      setIssues(["The profile could not be saved. Check your connection and try again."]);
    } finally { setSaving(false); }
  }

  const numberField = (key: "respondent_households" | "individuals") => (
    <Input
      id={`profile-${key}`} type="number" min={0} step={1} inputMode="numeric" className="tabular-nums"
      value={draft[key] ?? ""}
      onChange={(event) => setDraft({ ...draft, [key]: parseCount(event.target.value) })}
    />
  );

  return (
    <div className="space-y-4">
      {issues.length > 0 && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm">
          <p className="font-medium text-danger">The profile was not saved.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          {conflict && <Button className="mt-3" variant="outline" size="sm" onClick={onCancel}>Reload profile</Button>}
        </div>
      )}

      <ProfileRecordHeader name={barangayName} detail={initial ? "Editing community profile" : "New community profile"}>
        <p className="text-sm text-muted-foreground">
          Enter the counts exactly as printed in the barangay&apos;s profiling report. Leave a box empty when the report does not give that number; enter 0 only when it says zero. Percentages are worked out for you.
        </p>
        <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="profile-coverage">Coverage</Label>
            <Input id="profile-coverage" placeholder="Sitios or streets the report covers" value={draft.coverage} onChange={(event) => setDraft({ ...draft, coverage: event.target.value })} />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="profile-source">Source <span className="text-danger">*</span></Label>
            <Input id="profile-source" required value={draft.source_title} onChange={(event) => setDraft({ ...draft, source_title: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-collected">Collected on</Label>
            <Input id="profile-collected" type="date" value={draft.collected_on} onChange={(event) => setDraft({ ...draft, collected_on: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-respondent_households">Households surveyed</Label>
            {numberField("respondent_households")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-individuals">Individuals</Label>
            {numberField("individuals")}
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="profile-notes">Data notes</Label>
            <Textarea id="profile-notes" rows={3} placeholder="Gaps or quirks in the source, such as a missing collection date" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </div>
        </div>
      </ProfileRecordHeader>

      <Card className="border-border shadow-card">
        <CardContent className="px-5 pb-1 pt-1">
          <ProfileSectionTabs
            value={section}
            onChange={setSection}
            badge={(item) => `${item.indicators.filter((indicator) => hasContent(draft.data[indicator.key])).length}/${item.indicators.length}`}
          >
            {(item) => (
              <div className="columns-1 gap-4 lg:columns-2 xl:columns-3">
                {item.indicators.map((indicator) => (
                  <IndicatorEditor
                    key={indicator.key}
                    indicator={indicator}
                    value={draft.data[indicator.key]}
                    onCount={(category, raw) => updateIndicator(indicator.key, (current) => ({ ...current, counts: { ...current.counts, [category]: parseCount(raw) } }))}
                    onNote={(note) => updateIndicator(indicator.key, (current) => ({ ...current, note }))}
                  />
                ))}
              </div>
            )}
          </ProfileSectionTabs>
        </CardContent>
      </Card>

      {/* Right padding keeps Save clear of the floating assistant button. */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-background/95 py-3 pl-4 pr-20 shadow-card backdrop-blur">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {dirty ? <><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-warning" />Unsaved changes</> : "No changes yet"}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || (!dirty && initial !== null)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Save profile
          </Button>
        </div>
      </div>
    </div>
  );
}
