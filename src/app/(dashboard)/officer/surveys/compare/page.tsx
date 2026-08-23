"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, GitCompare, ArrowRight, ArrowUp, ArrowDown, Minus, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

// Pre/post survey comparison view.
// Lets researchers pick a baseline + follow-up survey pair and shows the shift
// in response distributions, question by question. Backed by
// /api/surveys/compare which does the matching server-side.

// ─── Types ───────────────────────────────────────────────────────────────────

interface SurveyOption {
  id:    string;
  title: string;
  parent_survey_id: string | null;
}

interface Distribution {
  distribution: { label: string; count: number; pct: number }[];
  response_count: number;
  average: number | null;
}

interface MatchedQuestion {
  question_text: string;
  question_type: string;
  section_title: string | null;
  baseline:      Distribution;
  followup:      Distribution;
  avg_delta:     number | null;
}

interface CompareData {
  baseline:       { id: string; title: string; status: string };
  followup:       { id: string; title: string; status: string };
  response_counts: { baseline: number; followup: number };
  excluded_counts: { baseline: number; followup: number };
  matched:        MatchedQuestion[];
  unmatched: {
    baseline_only: { id: string; question_text: string; question_type: string }[];
    followup_only: { id: string; question_text: string; question_type: string }[];
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PrePostComparePage() {
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [baselineId, setBaselineId] = useState("");
  const [followupId, setFollowupId] = useState("");
  const [data, setData]             = useState<CompareData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [comparing, setComparing]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // ── Fetch surveys ────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch("/api/surveys")
      .then((r) => r.json())
      .then((j) => {
        setSurveys((j.data ?? []).map((s: { id: string; title: string; parent_survey_id?: string | null }) => ({
          id: s.id, title: s.title, parent_survey_id: s.parent_survey_id ?? null,
        })));
      })
      .finally(() => setLoading(false));
  }, []);

  // When the user picks a follow-up that already has a parent declared,
  // auto-fill the baseline.
  useEffect(() => {
    if (!followupId) return;
    const fu = surveys.find((s) => s.id === followupId);
    if (fu?.parent_survey_id && !baselineId) setBaselineId(fu.parent_survey_id);
  }, [followupId, surveys, baselineId]);

  // ── Run comparison ───────────────────────────────────────────────────────
  const runCompare = useCallback(async () => {
    if (!baselineId || !followupId) return;
    setComparing(true);
    setError(null);
    setData(null);
    const r = await fetch(`/api/surveys/compare?baseline=${baselineId}&followup=${followupId}`);
    if (r.ok) {
      const j = await r.json();
      setData(j.data);
    } else {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Comparison failed");
    }
    setComparing(false);
  }, [baselineId, followupId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading surveys…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-primary" /> Pre / Post Comparison
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compare two surveys at the population level. Questions whose wording matches across the
          two surveys are aligned and their response distributions shown side by side.
        </p>
      </div>

      {/* ── Picker ─────────────────────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardContent className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Baseline survey</label>
              <select
                value={baselineId}
                onChange={(e) => setBaselineId(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-xl border border-border bg-card outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">— Select baseline —</option>
                {surveys.filter((s) => s.id !== followupId).map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Follow-up survey</label>
              <select
                value={followupId}
                onChange={(e) => setFollowupId(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-xl border border-border bg-card outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">— Select follow-up —</option>
                {surveys.filter((s) => s.id !== baselineId).map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            disabled={!baselineId || !followupId || comparing}
            onClick={runCompare}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm disabled:opacity-50"
          >
            {comparing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <GitCompare className="w-4 h-4" />}
            Compare
          </button>

          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {data && (
        <>
          {/* Summary */}
          <Card className="border-border shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 flex-wrap justify-between text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-info/10 text-info border-info/20 border">Baseline</Badge>
                  <span className="text-foreground font-medium">{data.baseline.title}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {data.response_counts.baseline} responses
                    {data.excluded_counts.baseline > 0 && ` (${data.excluded_counts.baseline} excluded)`}
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-success/10 text-success border-success/20 border">Follow-up</Badge>
                  <span className="text-foreground font-medium">{data.followup.title}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {data.response_counts.followup} responses
                    {data.excluded_counts.followup > 0 && ` (${data.excluded_counts.followup} excluded)`}
                  </span>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {data.matched.length} matched question{data.matched.length !== 1 ? "s" : ""} ·{" "}
                {data.unmatched.baseline_only.length + data.unmatched.followup_only.length} unmatched
              </div>
            </CardContent>
          </Card>

          {/* Unmatched-question warnings */}
          {(data.unmatched.baseline_only.length > 0 || data.unmatched.followup_only.length > 0) && (
            <Card className="border-warning/30">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium text-warning flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Unmatched questions
                </p>
                <p className="text-xs text-muted-foreground">
                  These questions could not be aligned. Re-word them to match exactly if you want
                  them included in the comparison.
                </p>
                {data.unmatched.baseline_only.length > 0 && (
                  <div className="text-xs">
                    <p className="font-medium text-foreground mt-1">Only in baseline:</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                      {data.unmatched.baseline_only.map((q) => <li key={q.id}>{q.question_text}</li>)}
                    </ul>
                  </div>
                )}
                {data.unmatched.followup_only.length > 0 && (
                  <div className="text-xs">
                    <p className="font-medium text-foreground mt-1">Only in follow-up:</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                      {data.unmatched.followup_only.map((q) => <li key={q.id}>{q.question_text}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Matched questions — comparison charts */}
          {data.matched.length === 0 ? (
            <Card className="border-border shadow-card">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                No questions matched between these two surveys. Make sure both surveys ask the same
                questions (word-for-word) where comparison is intended.
              </CardContent>
            </Card>
          ) : (
            data.matched.map((m, idx) => (
              <Card key={idx} className="border-border shadow-card">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {m.section_title && (
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {m.section_title}
                        </p>
                      )}
                      <CardTitle className="text-sm font-heading leading-snug">{m.question_text}</CardTitle>
                    </div>
                    {/* Rating-question delta: positive shift is shown green */}
                    {m.avg_delta != null && (
                      <Badge className={cn(
                        "border text-xs whitespace-nowrap",
                        m.avg_delta > 0  ? "bg-success/10 text-success border-success/20"
                        : m.avg_delta < 0  ? "bg-danger/10 text-danger border-danger/20"
                        :                    "bg-muted text-muted-foreground border"
                      )}>
                        {m.avg_delta > 0 ? <ArrowUp className="w-3 h-3 mr-0.5 inline" />
                        : m.avg_delta < 0 ? <ArrowDown className="w-3 h-3 mr-0.5 inline" />
                        : <Minus className="w-3 h-3 mr-0.5 inline" />}
                        Avg shift: {m.avg_delta > 0 ? "+" : ""}{m.avg_delta}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ComparisonChart matched={m} />
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
}

// ─── Side-by-side bar chart for a matched question ──────────────────────────

function ComparisonChart({ matched }: { matched: MatchedQuestion }) {
  // Merge labels — every option that exists in either side. Plot percentages
  // (not raw counts) so the visual stays fair when response counts differ.
  const labels = Array.from(new Set([
    ...matched.baseline.distribution.map((d) => d.label),
    ...matched.followup.distribution.map((d) => d.label),
  ]));

  const chartRows = labels.map((label) => {
    const b = matched.baseline.distribution.find((d) => d.label === label);
    const f = matched.followup.distribution.find((d) => d.label === label);
    return {
      label,
      baseline: b?.pct ?? 0,
      followup: f?.pct ?? 0,
      // Stash raw counts for the tooltip
      _bCount:  b?.count ?? 0,
      _fCount:  f?.count ?? 0,
    };
  });

  if (chartRows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-4">
        Open-text question — no distribution to compare. Use Themes (Coding) for qualitative analysis.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, chartRows.length * 32)}>
      <BarChart data={chartRows} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 100]}
        />
        <Tooltip
          contentStyle={{
            background: "#FFFFFF", border: "1px solid #E5DDD0",
            borderRadius: "8px", fontSize: "12px", color: "#2C2416",
          }}
          // recharts' Formatter typing is strict but the payload's actual
          // shape is forgiving; cast through unknown to avoid the noise.
          formatter={((v: number, name: string, ctx: unknown) => {
            const payload = (ctx as { payload?: { _bCount?: number; _fCount?: number } }).payload ?? {};
            const count = name === "baseline" ? (payload._bCount ?? 0) : (payload._fCount ?? 0);
            return [`${v}% (${count})`, name === "baseline" ? "Baseline" : "Follow-up"];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any}
        />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
        <Bar dataKey="baseline" fill="#5B7FA5" radius={[3, 3, 0, 0]} maxBarSize={40}>
          {chartRows.map((_, i) => <Cell key={`b-${i}`} />)}
        </Bar>
        <Bar dataKey="followup" fill="#4A7C59" radius={[3, 3, 0, 0]} maxBarSize={40}>
          {chartRows.map((_, i) => <Cell key={`f-${i}`} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
