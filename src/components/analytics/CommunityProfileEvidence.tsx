"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, ShieldAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCard, EmptyChart, PALETTE, axisTick, gridProps, needCategoryColor, tooltipProps } from "@/components/analytics/chart-kit";
import { parseCommunityProfile, type CommunityProfile, type CommunityProfileTable } from "@/lib/analytics/community-profile-contract";

type State =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "ready"; profiles: CommunityProfile[] };

const INDICATORS = "indicators";

/** "Php 10,000 - Php 19,999" → "₱10k – ₱19,999" so axis labels stay readable. */
function compactCategory(value: string) {
  return value.replace(/Php\s?/g, "₱").replace(/(\d),000\b/g, "$1k").replace(/\s-\s/g, " – ");
}

function baseNote(table: CommunityProfileTable) {
  const base = table.base ?? 0;
  if (table.multipleResponses) return `${base} responses · households could give more than one answer`;
  const people = ["sex/gender", "educational level"].includes(table.topic.toLowerCase());
  return `${base} ${people ? "residents" : "households"}`;
}

function IndicatorBars({ profile }: { profile: CommunityProfile }) {
  if (!profile.indicators.length) return <EmptyChart message="This profile has no matching indicator tables." />;
  const rows = profile.indicators.map((row) => ({ ...row, name: row.ofResponses ? `${row.label} (of responses)` : row.label }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 56, left: 8, bottom: 5 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={250} tick={{ ...axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
        <Tooltip {...tooltipProps} formatter={(v, _name, item) => [`${Number(v)}% · ${item?.payload?.count} of ${item?.payload?.base} ${item?.payload?.ofResponses ? "responses" : "households"}`, "Share"]} />
        <Bar dataKey="percent" radius={[0, 6, 6, 0]} maxBarSize={22}>
          {rows.map((row, i) => <Cell key={row.key} fill={needCategoryColor(row.theme, i)} />)}
          <LabelList dataKey="percent" position="right" formatter={(v) => `${Number(v)}%`} style={{ fontSize: 11, fill: PALETTE.text }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TableBars({ table }: { table: CommunityProfileTable }) {
  const rows = table.rows.map((row) => ({ ...row, label: compactCategory(row.category) }));
  if (!rows.length) return <EmptyChart message="No responses in this table." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 64, left: 8, bottom: 5 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={250} tick={{ ...axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
        <Tooltip {...tooltipProps} formatter={(v, _name, item) => [`${Number(v)} (${item?.payload?.percent ?? 0}%)`, "Count"]} labelFormatter={(label, payload) => payload?.[0]?.payload?.category ?? label} />
        <Bar dataKey="count" fill={PALETTE.primary} radius={[0, 6, 6, 0]} maxBarSize={22}>
          <LabelList dataKey="percent" position="right" formatter={(v) => `${Number(v)}%`} style={{ fontSize: 11, fill: PALETTE.text }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CommunityProfileEvidence() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [profileIndex, setProfileIndex] = useState(0);
  const [view, setView] = useState<string>(INDICATORS);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    void (async () => {
      try {
        const response = await fetch("/api/analytics/community-profile", { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { setState({ kind: "hidden" }); return; }
        if (!response.ok) throw new Error("Unavailable");
        const data = parseCommunityProfile((await response.json()).data);
        if (data.status === "disabled") setState({ kind: "hidden" });
        else if (!data.profiles.length) setState({ kind: "empty" });
        else setState({ kind: "ready", profiles: data.profiles });
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error" });
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  const profile = state.kind === "ready" ? state.profiles[Math.min(profileIndex, state.profiles.length - 1)] : null;
  const sections = useMemo(() => {
    const grouped = new Map<string, CommunityProfileTable[]>();
    for (const table of profile?.tables ?? []) grouped.set(table.section, [...(grouped.get(table.section) ?? []), table]);
    return Array.from(grouped.entries());
  }, [profile]);

  if (state.kind === "hidden") return null;
  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading household profile evidence…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <Card className="border-border shadow-card">
        <CardContent className="py-6 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Household profile evidence is temporarily unavailable.</p>
          <button onClick={() => setAttempt((value) => value + 1)} className="rounded border border-border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-primary">Retry</button>
        </CardContent>
      </Card>
    );
  }
  if (state.kind === "empty" || !profile) {
    return (
      <Card className="border-border shadow-card">
        <CardContent className="py-6 text-sm text-muted-foreground">
          No household profiling results have been imported yet. Completed profiling cycles with imported source tables appear here.
        </CardContent>
      </Card>
    );
  }

  const table = view === INDICATORS ? null : profile.tables.find((candidate) => candidate.id === view) ?? null;
  const importedOn = profile.importedAt ? new Date(profile.importedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : null;
  const source = [
    profile.sourceTitle,
    profile.sourceLocation || profile.barangay,
    profile.households != null ? `${profile.households} households` : null,
    profile.residents != null ? `${profile.residents} residents` : null,
    importedOn ? `imported ${importedOn}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <section aria-labelledby="profile-evidence-heading" className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 id="profile-evidence-heading" className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" /> Household Profile Evidence
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{source}</p>
        </div>
        {state.profiles.length > 1 && (
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            Barangay
            <select value={profileIndex} onChange={(event) => { setProfileIndex(Number(event.target.value)); setView(INDICATORS); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
              {state.profiles.map((item, index) => <option key={item.datasetId} value={index}>{item.barangay}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Headline indicators first; the same picker opens any source table. */}
      <ChartCard
        title="Household Vulnerability Indicators"
        description="Start with the key indicators, or pick any table from the profiling source to see its full distribution."
        icon={ShieldAlert}
        footer={table ? `${table.section} · ${baseNote(table)}` : "Share of profiled households reporting each condition, as printed in the profiling source. “Of responses” marks questions where households could give more than one answer."}
      >
        <div className="mb-4">
          <select
            aria-label="Profile view"
            value={view}
            onChange={(event) => setView(event.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground max-w-full"
          >
            <option value={INDICATORS}>Key vulnerability indicators</option>
            {sections.map(([section, tables]) => (
              <optgroup key={section} label={section}>
                {tables.map((item) => <option key={item.id} value={item.id}>{item.topic}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {table ? <TableBars table={table} /> : <IndicatorBars profile={profile} />}
      </ChartCard>
    </section>
  );
}
