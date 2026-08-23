"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Users, Clock, Calendar, Wallet, TrendingUp,
  Activity, CheckCircle, AlertCircle, Quote, ClipboardList, MapPin,
  Printer, FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { exportSheetsToExcel, printToPdf } from "@/lib/export";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { cn } from "@/lib/utils";

// Per-program analytics dashboard. Backed by /api/programs/[id]/analytics
// which does the seven-table rollup server-side.

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProgramAnalytics {
  program: {
    id:                   string;
    title:                string;
    description:          string | null;
    status:               string;
    start_date:           string | null;
    end_date:             string | null;
    budget:               number | null;
    target_beneficiaries: number | null;
    barangay_name:        string | null;
  };
  kpis: {
    activities_total:     number;
    activities_completed: number;
    attendance_total:     number;
    signups_active:       number;
    hours_approved:       number;
    hours_pending:        number;
    budget_planned:       number;
    budget_actual:        number;
    budget_utilization:   number;
  };
  activities: {
    id:         string; title: string; date: string; status: string;
    is_past:    boolean; attendance: number;
  }[];
  activities_by_status: Record<string, number>;
  signups_by_status:    Record<string, number>;
  hours_timeline:       { month: string; hours: number }[];
  followups: {
    stages:  { stage: "immediate" | "6_month" | "12_month"; total: number; completed: number }[];
    records: {
      id: string; followup_type: string; status: string;
      scheduled_date: string; completed_date: string | null; notes: string | null;
    }[];
  };
  budget_lines: {
    id: string; category: string;
    planned_amount: number | null; actual_amount: number | null; notes: string | null;
  }[];
  impact: {
    indicators: {
      id: string; indicator_type: string; value: number | null; unit: string;
      recorded_date: string; notes: string | null;
    }[];
    indicator_totals: Record<string, { value: number; unit: string }>;
    qualitative: {
      id: string; type: string; content: string;
      subject_name: string | null; recorded_date: string;
    }[];
    qualitative_by_type: Record<string, number>;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHART_STYLE = {
  cartesianGrid: { strokeDasharray: "3 3", stroke: "#E5DDD0" },
  tooltip: {
    contentStyle: {
      background: "#FFFFFF", border: "1px solid #E5DDD0",
      borderRadius: "8px", fontSize: "12px", color: "#2C2416",
    },
  },
};

const STAGE_LABEL: Record<string, string> = {
  immediate: "Immediate (≤1 week)",
  "6_month": "6-Month Review",
  "12_month": "12-Month Review",
};

const QUAL_LABEL: Record<string, string> = {
  testimonial:        "Testimonials",
  case_study:         "Case Studies",
  pre_post_narrative: "Pre/Post Narratives",
  observation:        "Observations",
};

const INDICATOR_LABEL: Record<string, string> = {
  beneficiaries_reached: "Beneficiaries reached",
  families_served:       "Families served",
  trainings_conducted:   "Trainings conducted",
  materials_distributed: "Materials distributed",
  volunteer_hours:       "Volunteer hours (declared)",
  custom:                "Custom",
};

const STATUS_BADGE: Record<string, string> = {
  draft:      "bg-muted text-muted-foreground border",
  active:     "bg-info/10 text-info border-info/20 border",
  completed:  "bg-success/10 text-success border-success/20 border",
  cancelled:  "bg-danger/10 text-danger border-danger/20 border",
  scheduled:  "bg-muted text-muted-foreground border",
};

const SIGNUP_COLORS: Record<string, string> = {
  confirmed:  "#4A7C59",
  pending:    "#B8860B",
  attended:   "#5B7FA5",
  no_show:    "#9B3B3B",
  withdrawn:  "#9C9488",
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const currency = (n: number | null | undefined) => {
  if (n == null) return "—";
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProgramAnalyticsPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [data, setData]       = useState<ProgramAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/programs/${id}/analytics`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setError(j.error ?? "Failed to load analytics");
          return;
        }
        const j = await r.json();
        setData(j.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading program analytics…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-3">
        <Link href="/officer/programs" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Programs
        </Link>
        <Card className="border-danger/20"><CardContent className="p-6 text-sm text-danger">{error ?? "Not found"}</CardContent></Card>
      </div>
    );
  }

  const { program, kpis } = data;
  // Capture for the closure so TS doesn't complain about `data` being null
  // when the user later clicks Export.
  const snapshot = data;

  // ── Export the full rollup as a multi-sheet workbook ──────────────────────
  function exportExcel() {
    exportSheetsToExcel(
      [
        {
          name: "Summary",
          rows: [
            { Metric: "Program",                Value: program.title },
            { Metric: "Status",                 Value: program.status },
            { Metric: "Barangay",               Value: program.barangay_name ?? "—" },
            { Metric: "Start date",             Value: program.start_date ?? "" },
            { Metric: "End date",               Value: program.end_date   ?? "" },
            { Metric: "Target beneficiaries",   Value: program.target_beneficiaries ?? "" },
            { Metric: "Active signups",         Value: kpis.signups_active },
            { Metric: "Activities total",       Value: kpis.activities_total },
            { Metric: "Activities completed",   Value: kpis.activities_completed },
            { Metric: "Total attendance",       Value: kpis.attendance_total },
            { Metric: "Volunteer hours (approved)", Value: kpis.hours_approved },
            { Metric: "Volunteer hours (pending)",  Value: kpis.hours_pending  },
            { Metric: "Budget planned (₱)",     Value: kpis.budget_planned },
            { Metric: "Budget actual (₱)",      Value: kpis.budget_actual  },
            { Metric: "Budget utilization (%)", Value: kpis.budget_utilization },
          ],
        },
        {
          name: "Activities",
          rows: snapshot.activities.map((a) => ({
            Title:      a.title,
            Date:       a.date,
            Status:     a.status,
            Attendance: a.attendance,
            Past:       a.is_past ? "yes" : "no",
          })),
        },
        {
          name: "Budget",
          rows: snapshot.budget_lines.map((b) => ({
            Category: b.category,
            Planned:  b.planned_amount ?? 0,
            Actual:   b.actual_amount  ?? 0,
            Variance: (b.planned_amount ?? 0) - (b.actual_amount ?? 0),
            Notes:    b.notes ?? "",
          })),
        },
        {
          name: "Impact Indicators",
          rows: snapshot.impact.indicators.map((i) => ({
            Type:  i.indicator_type,
            Value: i.value ?? 0,
            Unit:  i.unit,
            Recorded: i.recorded_date,
            Notes: i.notes ?? "",
          })),
        },
        {
          name: "Qualitative",
          rows: snapshot.impact.qualitative.map((q) => ({
            Type:    q.type,
            Subject: q.subject_name ?? "",
            Date:    q.recorded_date,
            Content: q.content,
          })),
        },
        {
          name: "Follow-ups",
          rows: snapshot.followups.records.map((f) => ({
            Stage:     f.followup_type,
            Status:    f.status,
            Scheduled: f.scheduled_date,
            Completed: f.completed_date ?? "",
            Notes:     f.notes ?? "",
          })),
        },
        {
          name: "Hours by Month",
          rows: snapshot.hours_timeline.map((h) => ({ Month: h.month, Hours: h.hours })),
        },
      ],
      `program-${program.title.slice(0, 30).replace(/[^a-z0-9]+/gi, "-")}-analytics`,
    );
  }

  // ── Derived chart data ─────────────────────────────────────────────────────
  const signupChartData = Object.entries(data.signups_by_status).map(([status, count]) => ({
    status, count, color: SIGNUP_COLORS[status] ?? "#6B5B3E",
  }));
  const indicatorTiles = Object.entries(data.impact.indicator_totals);
  const upcomingActivities  = data.activities.filter((a) => !a.is_past);
  const recentActivities    = data.activities.filter((a) => a.is_past).slice(-5).reverse();

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="space-y-2">
        <Link href="/officer/programs" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Programs
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold text-foreground">{program.title}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
              <Badge className={`${STATUS_BADGE[program.status] ?? STATUS_BADGE.draft} capitalize text-xs`}>
                {program.status}
              </Badge>
              {program.barangay_name && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {program.barangay_name}
                </span>
              )}
              {(program.start_date || program.end_date) && (
                <span>{fmtDate(program.start_date)} – {fmtDate(program.end_date)}</span>
              )}
            </div>
          </div>
          {/* Export controls — hidden when printing so they don't appear on the PDF */}
          <div className="flex gap-2 print-hidden">
            <button
              type="button"
              onClick={exportExcel}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-success/30 text-success text-sm hover:bg-success/5"
            >
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button
              type="button"
              onClick={() => printToPdf()}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-primary/30 text-primary text-sm hover:bg-primary/5"
            >
              <Printer className="w-4 h-4" /> Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-card border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Active Signups</p>
              <Users className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold font-heading mt-1">{kpis.signups_active}</p>
            {program.target_beneficiaries && (
              <p className="text-xs text-muted-foreground mt-0.5">
                target {program.target_beneficiaries}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-card border-l-4 border-l-info">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Volunteer Hours</p>
              <Clock className="w-4 h-4 text-info" />
            </div>
            <p className="text-2xl font-bold font-heading mt-1">{kpis.hours_approved.toLocaleString()}</p>
            {kpis.hours_pending > 0 && (
              <p className="text-xs text-warning mt-0.5">{kpis.hours_pending} pending approval</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-card border-l-4 border-l-success">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Activities</p>
              <Activity className="w-4 h-4 text-success" />
            </div>
            <p className="text-2xl font-bold font-heading mt-1">
              {kpis.activities_completed}
              <span className="text-xs text-muted-foreground font-normal ml-1">/ {kpis.activities_total}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">completed / total</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-card border-l-4 border-l-accent">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total Attendance</p>
              <CheckCircle className="w-4 h-4 text-accent-foreground" />
            </div>
            <p className="text-2xl font-bold font-heading mt-1">{kpis.attendance_total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">check-ins recorded</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Budget vs Actual ──────────────────────────────────────────────── */}
      {(kpis.budget_planned > 0 || kpis.budget_actual > 0) && (
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" /> Budget Utilization
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {currency(kpis.budget_actual)} of {currency(kpis.budget_planned)}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">Spent</span>
                <span className={cn(
                  "text-xs font-medium tabular-nums",
                  kpis.budget_utilization > 100 ? "text-danger" :
                  kpis.budget_utilization >= 85  ? "text-warning" :
                                                    "text-success"
                )}>
                  {kpis.budget_utilization}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-border overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    kpis.budget_utilization > 100 ? "bg-danger" :
                    kpis.budget_utilization >= 85  ? "bg-warning" :
                                                      "bg-success"
                  )}
                  style={{ width: `${Math.min(kpis.budget_utilization, 100)}%` }}
                />
              </div>
            </div>

            {data.budget_lines.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt/50 border-b border-border">
                    <tr>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Category</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Planned</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.budget_lines.map((b) => (
                      <tr key={b.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 px-3 text-foreground">{b.category}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{currency(b.planned_amount)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{currency(b.actual_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Volunteer hours timeline + Signup distribution ────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">

        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Hours Logged (6mo)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.hours_timeline.every((m) => m.hours === 0) ? (
              <p className="text-xs text-muted-foreground italic py-8 text-center">No approved volunteer hours yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.hours_timeline} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
                  <CartesianGrid {...CHART_STYLE.cartesianGrid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...CHART_STYLE.tooltip} formatter={(v) => [v, "hours"]} />
                  <Line
                    type="monotone" dataKey="hours" stroke="#6B5B3E" strokeWidth={2}
                    dot={{ r: 3, fill: "#6B5B3E" }} activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Signup Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {signupChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-8 text-center">No signups yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={signupChartData} dataKey="count" nameKey="status"
                    cx="50%" cy="50%" outerRadius={75} innerRadius={40}
                  >
                    {signupChartData.map((entry) => <Cell key={entry.status} fill={entry.color} />)}
                  </Pie>
                  <Tooltip {...CHART_STYLE.tooltip} formatter={(v, n) => [v, String(n).replace("_", " ")]} />
                </PieChart>
              </ResponsiveContainer>
            )}
            {signupChartData.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center text-xs mt-2">
                {signupChartData.map((e) => (
                  <div key={e.status} className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                    <span className="capitalize text-muted-foreground">{e.status.replace("_", " ")}</span>
                    <span className="tabular-nums font-medium">{e.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── Activity attendance bar chart ─────────────────────────────────── */}
      {data.activities.length > 0 && (
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Attendance per Activity
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Past activities sorted by date. Shows recorded check-ins per session.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(240, data.activities.length * 28)}>
              <BarChart
                data={data.activities.map((a) => ({
                  name: `${a.title.slice(0, 22)}${a.title.length > 22 ? "…" : ""}`,
                  attendance: a.attendance,
                }))}
                layout="vertical"
                margin={{ top: 5, right: 16, left: 80, bottom: 5 }}
              >
                <CartesianGrid {...CHART_STYLE.cartesianGrid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6B6356" }} axisLine={false} tickLine={false} width={120} />
                <Tooltip {...CHART_STYLE.tooltip} />
                <Bar dataKey="attendance" fill="#C4A96A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Impact indicators + qualitative ───────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">

        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" /> Impact Indicators
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {indicatorTiles.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">No impact indicators recorded yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {indicatorTiles.map(([type, { value, unit }]) => (
                  <div key={type} className="p-3 rounded-lg border border-border bg-surface-alt/30">
                    <p className="text-xs text-muted-foreground">
                      {INDICATOR_LABEL[type] ?? type}
                    </p>
                    <p className="text-xl font-bold font-heading tabular-nums mt-0.5">
                      {value.toLocaleString()}
                      <span className="text-xs text-muted-foreground font-normal ml-1">{unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
            {data.impact.indicators.length > 0 && (
              <Link
                href="/officer/impact"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
              >
                Manage indicators →
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Quote className="w-4 h-4 text-primary" /> Qualitative Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.impact.qualitative.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">
                No testimonials, case studies, or pre/post narratives yet.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {Object.entries(data.impact.qualitative_by_type).map(([t, n]) => (
                    <Badge key={t} className="bg-muted text-muted-foreground border text-xs">
                      {QUAL_LABEL[t] ?? t}: {n}
                    </Badge>
                  ))}
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin">
                  {data.impact.qualitative.slice(0, 6).map((q) => (
                    <div key={q.id} className="p-2.5 rounded-lg border border-border bg-surface-alt/30 text-sm">
                      <p className="text-foreground line-clamp-3">“{q.content}”</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {QUAL_LABEL[q.type] ?? q.type}
                        {q.subject_name && ` · ${q.subject_name}`}
                        {" · "}{fmtDate(q.recorded_date)}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── Follow-up tracking ────────────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-primary" /> Phase VIII Follow-up
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Staged assessment per the PARAYA framework — immediate, mid-term, and long-term.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {data.followups.stages.map((stage) => {
              const pct = stage.total === 0 ? 0 : Math.round((stage.completed / stage.total) * 100);
              return (
                <div key={stage.stage} className="p-3 rounded-xl border border-border bg-surface-alt/30">
                  <p className="text-xs font-medium text-foreground">{STAGE_LABEL[stage.stage]}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{stage.completed} / {stage.total} completed</p>
                  <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden">
                    <div className="h-full bg-success" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {data.followups.records.length > 0 && (
            <div className="border border-border rounded-lg divide-y divide-border max-h-56 overflow-y-auto scrollbar-thin">
              {data.followups.records.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-foreground font-medium">{STAGE_LABEL[f.followup_type] ?? f.followup_type}</p>
                    <p className="text-xs text-muted-foreground">
                      Scheduled {fmtDate(f.scheduled_date)}
                      {f.completed_date && ` · Completed ${fmtDate(f.completed_date)}`}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "border text-[10px] capitalize",
                      f.status === "completed"   ? "bg-success/10 text-success border-success/20"
                      : f.status === "in_progress" ? "bg-warning/10 text-warning border-warning/20"
                      :                            "bg-info/10    text-info    border-info/20"
                    )}
                  >
                    {f.status.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Upcoming + recent activities ──────────────────────────────────── */}
      {(upcomingActivities.length > 0 || recentActivities.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-4">
          {upcomingActivities.length > 0 && (
            <Card className="border-border shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading">Upcoming Activities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {upcomingActivities.slice(0, 6).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 text-sm">
                      <span className="text-foreground truncate">{a.title}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{fmtDate(a.date)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {recentActivities.length > 0 && (
            <Card className="border-border shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading">Recent Activities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {recentActivities.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 text-sm">
                      <span className="text-foreground truncate">{a.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground tabular-nums">{a.attendance} in</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(a.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

    </div>
  );
}
