"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeftRight, CalendarCheck, CheckCircle2, Loader2, MapPin, Quote, Target, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCard, EmptyChart, PALETTE, axisTick, gridProps, legendProps, shortLabel, tooltipProps } from "@/components/analytics/chart-kit";
import { parseImpactInsights, surveyComparisonSchema, type ImpactInsights, type SurveyComparison } from "@/lib/analytics/impact-contract";

type Load<T> = { kind: "loading" } | { kind: "hidden" } | { kind: "error" } | { kind: "ready"; data: T };

async function getJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) return { hidden: true as const };
  if (!response.ok) throw new Error("Unavailable");
  return { hidden: false as const, body: await response.json() };
}

/** KPI cards and charts showing what PARAYA's programs changed in partner barangays. */
export function ImpactOverview({ refreshKey = 0, afterTotals }: { refreshKey?: number; afterTotals?: ReactNode }) {
  const [state, setState] = useState<Load<ImpactInsights>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => (current.kind === "ready" ? current : { kind: "loading" }));
    void (async () => {
      try {
        const result = await getJson("/api/impact/insights", controller.signal);
        if (controller.signal.aborted) return;
        setState(result.hidden ? { kind: "hidden" } : { kind: "ready", data: parseImpactInsights(result.body.data) });
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error" });
      }
    })();
    return () => controller.abort();
  }, [attempt, refreshKey]);

  if (state.kind === "hidden") return null;
  if (state.kind === "loading") {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading impact overview…</div>;
  }
  if (state.kind === "error") {
    return (
      <Card className="border-border shadow-card">
        <CardContent className="py-6 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">The impact overview is temporarily unavailable.</p>
          <button onClick={() => setAttempt((value) => value + 1)} className="rounded border border-border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-primary">Retry</button>
        </CardContent>
      </Card>
    );
  }

  const { totals, reachByBarangay, plannedVsActual, followThrough, surveyPairs } = state.data;
  const followUps = totals.followUps;
  const barangayData = reachByBarangay.map((row) => ({ ...row, name: shortLabel(row.barangay, 18) }));
  const programData = plannedVsActual.map((row) => ({ ...row, name: shortLabel(row.program, 28) }));

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "People Reached", value: totals.peopleReached.toLocaleString(), sub: `across ${totals.barangaysReached} barangay${totals.barangaysReached === 1 ? "" : "s"}`, icon: Users, accent: "border-l-primary" },
          { label: "Programs Measured", value: totals.programsMeasured, sub: `${totals.completedPrograms} programs completed`, icon: Target, accent: "border-l-accent" },
          { label: "Stories Recorded", value: totals.stories, sub: "testimonials, case studies, observations", icon: Quote, accent: "border-l-success" },
          { label: "Follow-ups Completed", value: `${followUps.completed} of ${followUps.total}`, sub: `${followUps.overdue} overdue · ${followUps.upcoming} upcoming`, icon: followUps.overdue > 0 ? AlertCircle : CheckCircle2, accent: followUps.overdue > 0 ? "border-l-danger" : "border-l-info" },
        ].map(({ label, value, sub, icon: Icon, accent }) => (
          <Card key={label} className={`border-border shadow-card border-l-4 ${accent}`}>
            <CardContent className="px-5 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
              <p className="text-2xl font-bold font-heading text-foreground leading-tight mt-0.5">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {afterTotals}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="People Reached per Barangay" description="Beneficiaries recorded for programs in each barangay." icon={MapPin} footer={<Link href="/officer/impact/barangays" prefetch={false} className="font-medium text-primary hover:underline">See each barangay →</Link>}>
          {barangayData.length === 0 ? <EmptyChart message="No people-reached results recorded yet." height={280} icon={MapPin} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barangayData} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} labelFormatter={(label, payload) => payload?.[0]?.payload?.barangay ?? label}
                  formatter={(v, _name, item) => [`${Number(v).toLocaleString()} people · ${item?.payload?.programs ?? 0} programs`, "Reached"]} />
                <Bar dataKey="people" fill={PALETTE.primary} radius={[6, 6, 0, 0]} maxBarSize={64} label={{ position: "top", fontSize: 12, fill: PALETTE.text }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Planned vs Reached per Program" description="People each program's proposal planned to reach, against the people recorded. Active and completed programs only." icon={Target} footer={<Link href="/officer/impact/programs" prefetch={false} className="font-medium text-primary hover:underline">See each program →</Link>}>
          {programData.length === 0 ? <EmptyChart message="No programs with planned or recorded reach yet." height={280} icon={Target} /> : (
            <ResponsiveContainer width="100%" height={Math.max(280, programData.length * 44)}>
              <BarChart data={programData} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={190} tick={{ ...axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                <Tooltip {...tooltipProps} labelFormatter={(label, payload) => payload?.[0]?.payload?.program ?? label} />
                <Legend {...legendProps} />
                <Bar dataKey="planned" name="Planned" fill={PALETTE.accent} radius={[0, 4, 4, 0]} maxBarSize={14} />
                <Bar dataKey="reached" name="Reached" fill={PALETTE.success} radius={[0, 4, 4, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <BeforeAfterChart pairs={surveyPairs} />

        <ChartCard title="Follow-up Completion" description="Return visits after programs, by scheduled month." icon={CalendarCheck}>
          {followThrough.length === 0 ? <EmptyChart message="No follow-ups scheduled yet." height={280} icon={CalendarCheck} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={followThrough} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="month" tick={{ ...axisTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} />
                <Legend {...legendProps} />
                <Bar dataKey="completed" name="Completed" stackId="followup" fill={PALETTE.success} maxBarSize={36} />
                <Bar dataKey="upcoming" name="Upcoming" stackId="followup" fill={PALETTE.info} maxBarSize={36} />
                <Bar dataKey="overdue" name="Overdue" stackId="followup" fill={PALETTE.danger} maxBarSize={36} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </>
  );
}

function BeforeAfterChart({ pairs }: { pairs: ImpactInsights["surveyPairs"] }) {
  const [pairIndex, setPairIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [state, setState] = useState<Load<SurveyComparison>>({ kind: "loading" });
  const pair = pairs[Math.min(pairIndex, pairs.length - 1)] ?? null;

  useEffect(() => {
    if (!pair) return;
    const controller = new AbortController();
    setState({ kind: "loading" });
    setQuestionIndex(0);
    void (async () => {
      try {
        const result = await getJson(`/api/surveys/compare?baseline=${encodeURIComponent(pair.baselineId)}&followup=${encodeURIComponent(pair.followupId)}`, controller.signal);
        if (controller.signal.aborted) return;
        if (result.hidden) { setState({ kind: "hidden" }); return; }
        const parsed = surveyComparisonSchema.safeParse(result.body.data);
        setState(parsed.success ? { kind: "ready", data: parsed.data } : { kind: "error" });
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error" });
      }
    })();
    return () => controller.abort();
  }, [pair]);

  // Free-text questions have no distribution to compare.
  const questions = useMemo(() => state.kind === "ready" ? state.data.matched.filter((row) => row.baseline.distribution.length > 0) : [], [state]);
  const question = questions[Math.min(questionIndex, questions.length - 1)] ?? null;
  const chartData = useMemo(() => {
    if (!question) return [];
    const labels = Array.from(new Set([...question.baseline.distribution.map((row) => row.label), ...question.followup.distribution.map((row) => row.label)]));
    const pct = (rows: typeof question.baseline.distribution, label: string) => rows.find((row) => row.label === label)?.pct ?? 0;
    return labels.map((label) => ({
      label: question.question_type === "rating" ? `Rated ${label}` : label,
      before: pct(question.baseline.distribution, label),
      after: pct(question.followup.distribution, label),
    }));
  }, [question]);

  const footer = state.kind === "ready" && question
    ? [
        question.baseline.average != null && question.followup.average != null
          ? `Average ${question.baseline.average} → ${question.followup.average} (${question.avg_delta != null && question.avg_delta >= 0 ? "+" : ""}${question.avg_delta ?? 0})`
          : null,
        `${state.data.response_counts.baseline} responses before · ${state.data.response_counts.followup} after`,
      ].filter(Boolean).join(" · ")
    : undefined;

  return (
    <ChartCard title="Before vs After" description="The same survey question before a program and at follow-up — share of respondents per answer." icon={ArrowLeftRight} footer={footer}>
      {!pair ? (
        <EmptyChart message="Link a follow-up survey to its baseline to compare results here." height={280} icon={ArrowLeftRight} />
      ) : state.kind === "hidden" ? (
        <EmptyChart message="You do not have access to survey comparisons." height={280} icon={ArrowLeftRight} />
      ) : state.kind === "error" ? (
        <EmptyChart message="The survey comparison is temporarily unavailable." height={280} icon={ArrowLeftRight} />
      ) : state.kind === "loading" ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" style={{ height: 280 }}><Loader2 className="w-4 h-4 animate-spin" /> Loading comparison…</div>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {pairs.length > 1 && (
              <select aria-label="Survey pair" value={pairIndex} onChange={(event) => setPairIndex(Number(event.target.value))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground max-w-full">
                {pairs.map((item, index) => <option key={item.followupId} value={index}>{item.baselineTitle} → {item.followupTitle}</option>)}
              </select>
            )}
            {questions.length > 0 && (
              <select aria-label="Survey question" value={Math.min(questionIndex, questions.length - 1)} onChange={(event) => setQuestionIndex(Number(event.target.value))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground max-w-full">
                {questions.map((item, index) => <option key={item.question_text} value={index}>{item.question_text}</option>)}
              </select>
            )}
          </div>
          {!question ? <EmptyChart message="These surveys share no rating or choice questions." height={240} icon={ArrowLeftRight} /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="label" tick={{ ...axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} formatter={(v, name) => [`${Number(v)}%`, String(name)]} />
                <Legend {...legendProps} />
                <Bar dataKey="before" name="Before" fill={PALETTE.muted} radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="after" name="After" fill={PALETTE.success} radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </ChartCard>
  );
}
