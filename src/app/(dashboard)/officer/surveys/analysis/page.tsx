"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2, BarChart3, FileText, Users, CheckCircle2,
  XCircle, Clock, ChevronRight, Search, TrendingUp,
  Tag, Plus, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart,
  Line, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SurveyStatus = "draft" | "published" | "closed";

interface SurveyRow {
  id:                 string;
  title:              string;
  status:             SurveyStatus;
  created_at:         string;
  published_at:       string | null;
  opens_at:           string | null;
  closes_at:          string | null;
  target_barangay_id: string | null;
  barangay_name:      string | null;
  question_count:     number;
  response_count:     number;
}

interface OverviewData {
  summary: {
    total: number; draft: number; published: number; closed: number; total_responses: number;
  };
  surveys:            SurveyRow[];
  responses_by_month: { month: string; count: number }[];
  by_status:          { status: string; count: number; color: string }[];
  by_barangay:        { name: string; count: number }[];
}

interface QuestionStat {
  id:             string;
  question_text:  string;
  question_type:  string;
  options:        string[] | null;
  section_title:  string | null;
  is_required:    boolean;
  response_count: number;
  distribution:   { label: string; count: number }[];
  average:        number | null;
}

interface ResponseRow {
  id:               string;
  submitted_at:     string | null;
  excluded:         boolean;
  exclusion_reason: string | null;
  excluded_at:      string | null;
}

interface DetailData {
  survey: {
    id: string; title: string; description: string | null; status: string;
    opens_at: string | null; closes_at: string | null; is_anonymous: boolean;
    barangay_name: string | null; created_at: string;
  };
  response_count:   number;
  excluded_count:   number;
  include_excluded: boolean;
  questions:        QuestionStat[];
  timeline:         { month: string; count: number }[];
  responses:        ResponseRow[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CHART_STYLE = {
  cartesianGrid: { strokeDasharray: "3 3", stroke: "#E5DDD0" },
  tooltip: {
    contentStyle: {
      background: "#FFFFFF", border: "1px solid #E5DDD0",
      borderRadius: "8px", fontSize: "12px", color: "#2C2416",
    },
  },
};

const TYPE_COLORS: Record<string, string> = {
  text:            "#6B5B3E",
  multiple_choice: "#C4A96A",
  checkbox:        "#4A7C59",
  rating:          "#5B7FA5",
};

const STATUS_META: Record<SurveyStatus, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-muted text-muted-foreground border" },
  published: { label: "Published", cls: "bg-success/10 text-success border-success/20 border" },
  closed:    { label: "Closed",    cls: "bg-danger/10 text-danger border-danger/20 border" },
};

const TYPE_LABELS: Record<string, string> = {
  text:            "Short Text",
  multiple_choice: "Multiple Choice",
  checkbox:        "Checkboxes",
  rating:          "Rating (1–5)",
};

type TabId = "overview" | "analysis" | "questions" | "themes";

interface AnswerCode {
  label:    string;
  coders:   { id: string; name: string }[];
  code_ids: string[];
  agreed:   boolean;
}

interface CodableAnswer {
  id:           string;
  text:         string;
  submitted_at: string | null;
  codes:        AnswerCode[];
}

interface ThemesData {
  survey:    { id: string; title: string };
  questions: {
    id:            string;
    question_text: string;
    section_title: string | null;
    answer_count:  number;
    answers:       CodableAnswer[];
  }[];
  labels: { label: string; count: number; coder_count: number }[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function effectivenessRating(avg: number | null): { label: string; color: string } | null {
  if (avg === null) return null;
  const pct = (avg / 5) * 100;
  if (pct >= 75) return { label: "Effective",     color: "#4A7C59" };
  if (pct >= 50) return { label: "Moderate",      color: "#B8860B" };
  return            { label: "Not Effective",   color: "#9B3B3B" };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function QuestionCard({ q, index }: { q: QuestionStat; index: number }) {
  const rating = q.question_type === "rating" ? effectivenessRating(q.average) : null;
  const totalDist = q.distribution.reduce((s, d) => s + d.count, 0);

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <span className="text-sm font-bold text-muted-foreground w-6 flex-shrink-0 pt-0.5">{index + 1}.</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug mb-1.5">
              {q.question_text || <span className="italic text-muted-foreground">(untitled question)</span>}
              {q.is_required && <span className="text-danger ml-1">*</span>}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className="text-[10px] capitalize" style={{ background: `${TYPE_COLORS[q.question_type]}18`, color: TYPE_COLORS[q.question_type], border: `1px solid ${TYPE_COLORS[q.question_type]}30` }}>
                {TYPE_LABELS[q.question_type] ?? q.question_type}
              </Badge>
              {q.section_title && (
                <Badge className="text-[10px] bg-muted text-muted-foreground border">
                  {q.section_title}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-xl font-bold font-heading text-foreground">{q.response_count}</p>
            <p className="text-[10px] text-muted-foreground">responses</p>
          </div>
        </div>

        {/* Stats row for rating */}
        {q.question_type === "rating" && q.average !== null && (
          <div className="flex items-center gap-4 mb-4 px-1">
            <div>
              <p className="text-xs text-muted-foreground">Average</p>
              <p className="text-lg font-bold font-heading text-foreground">{q.average.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Out of</p>
              <p className="text-lg font-bold font-heading text-muted-foreground">5.00</p>
            </div>
            {rating && (
              <div
                className="ml-auto px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: `${rating.color}18`, color: rating.color }}
              >
                {rating.label}
              </div>
            )}
          </div>
        )}

        {/* Distribution chart */}
        {q.distribution.length > 0 && totalDist > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Response Distribution</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={q.distribution}
                margin={{ top: 0, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid {...CHART_STYLE.cartesianGrid} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                <Tooltip
                  {...CHART_STYLE.tooltip}
                  formatter={(v) => [Number(v), "Responses"]}
                />
                <Bar
                  dataKey="count"
                  fill={TYPE_COLORS[q.question_type] ?? "#6B5B3E"}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : q.question_type === "text" ? (
          <p className="text-xs text-muted-foreground italic px-1">
            Open-text responses — no distribution chart available.
          </p>
        ) : q.response_count === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">No responses yet.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SurveyAnalysisPage() {
  const [activeTab, setActiveTab]         = useState<TabId>("overview");
  const [overview, setOverview]           = useState<OverviewData | null>(null);
  const [loading, setLoading]             = useState(true);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [detail, setDetail]               = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<"" | SurveyStatus>("");
  const [barangayFilter, setBarangayFilter] = useState("");
  // Data-scrubbing controls: include flagged-as-excluded responses in aggregates
  // (default off), and track which row is currently being flagged.
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [flaggingId, setFlaggingId]           = useState<string | null>(null);

  // Themes (qualitative coding) state — loaded when the Themes tab is opened
  // for a selected survey.
  const [themes, setThemes]                   = useState<ThemesData | null>(null);
  const [themesLoading, setThemesLoading]     = useState(false);
  const [newLabelByAnswer, setNewLabelByAnswer] = useState<Record<string, string>>({});
  const [codingAnswerId, setCodingAnswerId]   = useState<string | null>(null);
  const [labelFilter, setLabelFilter]         = useState("");

  // ── Fetch overview ───────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/surveys/analytics");
    if (res.ok) { const j = await res.json(); setOverview(j.data); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // ── Fetch detail when survey selected ────────────────────────────────────────
  // Re-fetch whenever the include-excluded toggle flips so aggregates match the
  // researcher's intent.
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    const qs = includeExcluded ? "&include_excluded=1" : "";
    fetch(`/api/surveys/analytics?survey_id=${selectedId}${qs}`)
      .then((r) => r.json())
      .then((j) => setDetail(j.data ?? null))
      .finally(() => setDetailLoading(false));
  }, [selectedId, includeExcluded]);

  // ── Themes (qualitative coding) ────────────────────────────────────────────
  const fetchThemes = useCallback(async (surveyId: string) => {
    setThemesLoading(true);
    const r = await fetch(`/api/surveys/${surveyId}/codes`);
    if (r.ok) { const j = await r.json(); setThemes(j.data ?? null); }
    else      { setThemes(null); }
    setThemesLoading(false);
  }, []);

  // Fetch themes when the Themes tab is shown for a selected survey.
  useEffect(() => {
    if (activeTab !== "themes") return;
    if (!selectedId) { setThemes(null); return; }
    fetchThemes(selectedId);
  }, [activeTab, selectedId, fetchThemes]);

  async function applyCode(answerId: string, label: string) {
    if (!selectedId) return;
    const trimmed = label.trim();
    if (!trimmed) return;
    setCodingAnswerId(answerId);
    const r = await fetch(`/api/surveys/${selectedId}/codes`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ answer_id: answerId, label: trimmed }),
    });
    setCodingAnswerId(null);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Failed to apply code.");
      return;
    }
    setNewLabelByAnswer((m) => ({ ...m, [answerId]: "" }));
    fetchThemes(selectedId);
  }

  async function removeCode(codeId: string) {
    if (!selectedId) return;
    const reason = window.prompt("Reason for voiding this code (history is retained):", "")?.trim();
    if (!reason || reason.length < 3) return;
    const r = await fetch(`/api/surveys/answer-codes/${codeId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Failed to remove code.");
      return;
    }
    fetchThemes(selectedId);
  }

  // ── Flag / unflag a survey response as an outlier ──────────────────────────
  async function toggleExcluded(row: ResponseRow) {
    if (!detail) return;
    let reason: string | null = null;
    if (!row.excluded) {
      const r = window.prompt(
        "Reason for excluding this response (required — kept on record for audit):",
        ""
      );
      if (r === null) return;          // user cancelled
      if (r.trim().length < 3) {
        alert("Please provide a brief reason (3+ characters).");
        return;
      }
      reason = r.trim();
    }
    if (row.excluded) {
      const reinstatementReason = window.prompt("Reason for reinstating this response (required; prior exclusion remains in correction history):", "");
      if (reinstatementReason === null) return;
      if (reinstatementReason.trim().length < 3) { alert("Please provide a brief reason (3+ characters)."); return; }
      reason = reinstatementReason.trim();
    }
    setFlaggingId(row.id);
    const res = await fetch(`/api/surveys/responses/${row.id}/flag`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ excluded: !row.excluded, reason }),
    });
    setFlaggingId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed to update response.");
      return;
    }
    // Refetch detail to refresh aggregates with the new exclusion state.
    setDetailLoading(true);
    const qs = includeExcluded ? "&include_excluded=1" : "";
    const r2 = await fetch(`/api/surveys/analytics?survey_id=${selectedId}${qs}`);
    if (r2.ok) { const j = await r2.json(); setDetail(j.data ?? null); }
    setDetailLoading(false);
  }

  // ── Filtered surveys for table ────────────────────────────────────────────────
  const filteredSurveys = useMemo(() => {
    if (!overview) return [];
    const q = search.toLowerCase();
    return overview.surveys.filter((s) => {
      if (q) {
        const matchesSearch =
          s.title.toLowerCase().includes(q) ||
          (s.barangay_name?.toLowerCase().includes(q) ?? false);
        if (!matchesSearch) return false;
      }
      if (statusFilter && s.status !== statusFilter) return false;
      if (barangayFilter && (s.barangay_name ?? "") !== barangayFilter) return false;
      return true;
    });
  }, [overview, search, statusFilter, barangayFilter]);

  const uniqueBarangays = useMemo(() => {
    if (!overview) return [];
    return Array.from(
      new Set(overview.surveys.map((s) => s.barangay_name).filter((n): n is string => !!n))
    ).sort();
  }, [overview]);

  const hasActiveFilters = !!(search || statusFilter || barangayFilter);
  const clearFilters = () => { setSearch(""); setStatusFilter(""); setBarangayFilter(""); };

  // ── Derived chart data from detail ───────────────────────────────────────────
  const typeDistribution = useMemo(() => {
    if (!detail) return [];
    const map = new Map<string, number>();
    detail.questions.forEach((q) => {
      map.set(q.question_type, (map.get(q.question_type) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([type, count]) => ({
      name:  TYPE_LABELS[type] ?? type,
      value: count,
      color: TYPE_COLORS[type] ?? "#9C9488",
    }));
  }, [detail]);

  const sectionDistribution = useMemo(() => {
    if (!detail) return [];
    const map = new Map<string, number>();
    detail.questions.forEach((q) => {
      const s = q.section_title ?? "General";
      map.set(s, (map.get(s) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([section, count]) => ({ section, count }));
  }, [detail]);

  // ── Tab bar ───────────────────────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "overview",  label: "Overview",          icon: <BarChart3  className="w-4 h-4" /> },
    { id: "analysis",  label: "Survey Analysis",   icon: <FileText   className="w-4 h-4" /> },
    { id: "questions", label: "Question Analysis", icon: <TrendingUp className="w-4 h-4" /> },
    { id: "themes",    label: "Themes (Coding)",   icon: <Tag        className="w-4 h-4" /> },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading survey analytics…</span>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="py-40 text-center text-muted-foreground">
        Failed to load analytics. Please refresh.
      </div>
    );
  }

  const { summary } = overview;

  return (
    <div className="space-y-6">

      {/* Tab bar */}
      <div className="flex items-center border-b border-border gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB: OVERVIEW ═══════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-fade-in">

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: "Total Surveys",    value: summary.total,           icon: FileText,       accent: "border-l-primary" },
              { label: "Published",        value: summary.published,       icon: CheckCircle2,   accent: "border-l-success" },
              { label: "Draft",            value: summary.draft,           icon: Clock,          accent: "border-l-muted-foreground" },
              { label: "Closed",           value: summary.closed,          icon: XCircle,        accent: "border-l-danger" },
              { label: "Total Responses",  value: summary.total_responses, icon: Users,          accent: "border-l-accent" },
            ].map(({ label, value, icon: Icon, accent }) => (
              <Card key={label} className={`border-border shadow-card border-l-4 ${accent}`}>
                <CardContent className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                  <p className="text-3xl font-bold font-heading text-foreground">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts row 1: responses timeline + status pie */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <Card className="border-border shadow-card lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Responses — Last 6 Months
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={overview.responses_by_month} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                    <CartesianGrid {...CHART_STYLE.cartesianGrid} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                    <Tooltip {...CHART_STYLE.tooltip} formatter={(v) => [Number(v), "Responses"]} />
                    <Line type="monotone" dataKey="count" stroke="#6B5B3E" strokeWidth={2} dot={{ fill: "#6B5B3E", r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Surveys by Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {overview.by_status.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No surveys yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={overview.by_status} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3}>
                        {overview.by_status.map((e) => <Cell key={e.status} fill={e.color} />)}
                      </Pie>
                      <Tooltip {...CHART_STYLE.tooltip} formatter={(v, n) => [Number(v), String(n)]} />
                      <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: "#6B6356" }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts row 2: surveys by barangay */}
          {overview.by_barangay.length > 0 && (
            <Card className="border-border shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Surveys by Partner Barangay
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={overview.by_barangay} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid {...CHART_STYLE.cartesianGrid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                    <Tooltip {...CHART_STYLE.tooltip} formatter={(v) => [Number(v), "Surveys"]} />
                    <Bar dataKey="count" fill="#C4A96A" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {/* ══ TAB: SURVEY ANALYSIS ════════════════════════════════════════════════ */}
      {activeTab === "analysis" && (
        <div className="space-y-6 animate-fade-in">

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search surveys or barangays…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-56 focus-visible:ring-primary/30"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | SurveyStatus)}
              className="h-9 px-3 text-sm"
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
            </select>

            <select
              value={barangayFilter}
              onChange={(e) => setBarangayFilter(e.target.value)}
              className="h-9 px-3 text-sm"
            >
              <option value="">All barangays</option>
              {uniqueBarangays.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            <span className="text-sm text-muted-foreground">
              {filteredSurveys.length} survey{filteredSurveys.length !== 1 ? "s" : ""}
            </span>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors ml-1"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Survey table */}
          <div className="bg-card border border-border shadow-card rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-16 z-20 bg-muted/95 backdrop-blur-sm">
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium first:rounded-tl-xl">Survey Title</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Barangay</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Questions</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Responses</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden lg:table-cell">Created</th>
                  <th className="py-3 px-4 w-8 last:rounded-tr-xl" />
                </tr>
              </thead>
                  <tbody>
                    {filteredSurveys.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center text-muted-foreground text-sm">
                          {overview.surveys.length === 0
                            ? "No surveys yet."
                            : hasActiveFilters
                              ? "No surveys match your filters."
                              : "No surveys yet."}
                        </td>
                      </tr>
                    ) : filteredSurveys.map((s, i) => (
                      <>
                        <tr
                          key={s.id}
                          onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
                          className={cn(
                            "border-b border-border/60 cursor-pointer transition-colors",
                            selectedId === s.id
                              ? "bg-primary/5"
                              : i % 2 !== 0 ? "bg-muted/10 hover:bg-muted/20" : "hover:bg-muted/10",
                          )}
                        >
                          <td className="py-3 px-4">
                            <p className="font-medium text-foreground">{s.title}</p>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                            {s.barangay_name ?? <span className="italic">All</span>}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{s.question_count}</td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-foreground">{s.response_count}</span>
                          </td>
                          <td className="py-3 px-4">
                            <Badge className={`${STATUS_META[s.status].cls} text-[10px] capitalize`}>
                              {STATUS_META[s.status].label}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{fmtDate(s.created_at)}</td>
                          <td className="py-3 px-4">
                            <ChevronRight className={cn(
                              "w-4 h-4 text-muted-foreground transition-transform",
                              selectedId === s.id ? "rotate-90 text-primary" : "",
                            )} />
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {selectedId === s.id && (
                          <tr key={`${s.id}-detail`} className="bg-primary/5 border-b border-border/60">
                            <td colSpan={7} className="px-4 py-5">
                              {detailLoading ? (
                                <div className="flex items-center gap-2 text-muted-foreground py-4">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span className="text-sm">Loading survey details…</span>
                                </div>
                              ) : detail ? (
                                <div className="space-y-4">
                                  {/* Meta row */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {[
                                      { label: "Opens",      value: fmtDate(detail.survey.opens_at) },
                                      { label: "Closes",     value: fmtDate(detail.survey.closes_at) },
                                      { label: "Anonymous",  value: detail.survey.is_anonymous ? "Yes" : "No" },
                                      { label: "Responses",  value: String(detail.response_count) },
                                    ].map(({ label, value }) => (
                                      <div key={label} className="bg-card rounded-lg px-3 py-2 border border-border">
                                        <p className="text-xs text-muted-foreground">{label}</p>
                                        <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Charts row */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                    {/* Question types pie */}
                                    {typeDistribution.length > 0 && (
                                      <div className="bg-card rounded-xl border border-border p-4">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Questions by Type</p>
                                        <ResponsiveContainer width="100%" height={160}>
                                          <PieChart>
                                            <Pie data={typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3}>
                                              {typeDistribution.map((e) => <Cell key={e.name} fill={e.color} />)}
                                            </Pie>
                                            <Tooltip {...CHART_STYLE.tooltip} formatter={(v, n) => [Number(v), String(n)]} />
                                            <Legend iconType="circle" iconSize={7} formatter={(v) => <span style={{ fontSize: 10, color: "#6B6356" }}>{v}</span>} />
                                          </PieChart>
                                        </ResponsiveContainer>
                                      </div>
                                    )}

                                    {/* Questions by section bar */}
                                    {sectionDistribution.length > 1 && (
                                      <div className="bg-card rounded-xl border border-border p-4">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Questions by Section</p>
                                        <ResponsiveContainer width="100%" height={160}>
                                          <BarChart data={sectionDistribution} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                                            <CartesianGrid {...CHART_STYLE.cartesianGrid} />
                                            <XAxis dataKey="section" tick={{ fontSize: 10, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                                            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                                            <Tooltip {...CHART_STYLE.tooltip} formatter={(v) => [Number(v), "Questions"]} />
                                            <Bar dataKey="count" fill="#6B5B3E" radius={[3, 3, 0, 0]} />
                                          </BarChart>
                                        </ResponsiveContainer>
                                      </div>
                                    )}

                                    {/* Response timeline */}
                                    {detail.timeline.length > 0 && (
                                      <div className="bg-card rounded-xl border border-border p-4 md:col-span-2">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Response Timeline</p>
                                        <ResponsiveContainer width="100%" height={140}>
                                          <LineChart data={detail.timeline} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                                            <CartesianGrid {...CHART_STYLE.cartesianGrid} />
                                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                                            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                                            <Tooltip {...CHART_STYLE.tooltip} formatter={(v) => [Number(v), "Responses"]} />
                                            <Line type="monotone" dataKey="count" stroke="#4A7C59" strokeWidth={2} dot={{ fill: "#4A7C59", r: 3 }} />
                                          </LineChart>
                                        </ResponsiveContainer>
                                      </div>
                                    )}
                                  </div>

                                  {/* CTA to question analysis */}
                                  {detail.questions.length > 0 && (
                                    <button
                                      onClick={() => setActiveTab("questions")}
                                      className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                                    >
                                      View full question analysis <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ══ TAB: QUESTION ANALYSIS ══════════════════════════════════════════════ */}
      {activeTab === "questions" && (
        <div className="space-y-5 animate-fade-in">

          {/* Survey selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value || null)}
                className="h-9 px-3 text-sm rounded-xl border border-border bg-card text-foreground
                           outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
              >
                <option value="">— Select a survey —</option>
                {overview.surveys.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
            {detail && (
              <span className="text-sm text-muted-foreground">
                {detail.questions.length} question{detail.questions.length !== 1 ? "s" : ""} ·{" "}
                {detail.response_count} response{detail.response_count !== 1 ? "s" : ""}
                {detail.excluded_count > 0 && (
                  <span className="ml-1 text-warning">({detail.excluded_count} excluded)</span>
                )}
              </span>
            )}
            {detail && detail.excluded_count > 0 && (
              <button
                type="button"
                role="switch"
                aria-checked={includeExcluded}
                onClick={() => setIncludeExcluded((v) => !v)}
                className={cn(
                  "ml-auto inline-flex items-center gap-2 h-8 px-3 rounded-full border text-xs transition-colors",
                  includeExcluded
                    ? "bg-warning/10 text-warning border-warning/30"
                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                )}
                title="Show excluded responses in aggregates"
              >
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  includeExcluded ? "bg-warning" : "bg-muted-foreground/40"
                )} />
                Include excluded
              </button>
            )}
          </div>

          {/* Data quality / responses panel — lets the researcher flag outliers
              with a documented reason. Hidden until a survey is picked. */}
          {detail && detail.responses.length > 0 && (
            <Card className="border-border shadow-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-sm font-heading">Responses</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Flag a response as an outlier to exclude it from aggregates. Decisions stay on record.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="max-h-64 overflow-y-auto scrollbar-thin divide-y divide-border text-sm">
                  {detail.responses.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground truncate">
                            {r.id.slice(0, 8)}…
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {r.submitted_at
                              ? new Date(r.submitted_at).toLocaleString("en-US", {
                                  month: "short", day: "numeric", year: "numeric",
                                  hour: "numeric", minute: "2-digit",
                                })
                              : "—"}
                          </span>
                          {r.excluded && (
                            <Badge className="bg-warning/10 text-warning border-warning/20 border text-[10px] px-1.5 py-0">
                              excluded
                            </Badge>
                          )}
                        </div>
                        {r.excluded && r.exclusion_reason && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-2">
                            “{r.exclusion_reason}”
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={flaggingId === r.id}
                        onClick={() => toggleExcluded(r)}
                        className={cn(
                          "text-xs h-7 px-2.5 rounded-lg border transition-colors flex-shrink-0",
                          r.excluded
                            ? "border-success/30 text-success hover:bg-success/5"
                            : "border-warning/40 text-warning hover:bg-warning/5",
                          flaggingId === r.id && "opacity-50 cursor-wait"
                        )}
                      >
                        {flaggingId === r.id
                          ? "…"
                          : r.excluded ? "Restore" : "Flag as outlier"}
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Content */}
          {!selectedId ? (
            <div className="py-24 text-center text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a survey above to view question-level analysis.</p>
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading questions…
            </div>
          ) : !detail ? (
            <div className="py-24 text-center text-muted-foreground text-sm">
              Failed to load question data.
            </div>
          ) : detail.questions.length === 0 ? (
            <div className="py-24 text-center text-muted-foreground text-sm">
              This survey has no questions.
            </div>
          ) : (
            <>
              {/* Group by section */}
              {(() => {
                const sections = Array.from(
                  new Set(detail.questions.map((q) => q.section_title ?? "General")),
                );
                return sections.map((section) => {
                  const sqs = detail.questions.filter((q) => (q.section_title ?? "General") === section);
                  return (
                    <div key={section} className="space-y-3">
                      {sections.length > 1 && (
                        <div className="flex items-center gap-2">
                          <h3 className="font-heading text-sm font-semibold text-foreground">{section}</h3>
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-muted-foreground">{sqs.length} question{sqs.length !== 1 ? "s" : ""}</span>
                        </div>
                      )}
                      {sqs.map((q) => (
                        <QuestionCard key={q.id} q={q} index={detail.questions.indexOf(q)} />
                      ))}
                    </div>
                  );
                });
              })()}
            </>
          )}

        </div>
      )}

      {/* ══ TAB: THEMES (QUALITATIVE CODING) ════════════════════════════════════ */}
      {activeTab === "themes" && (
        <div className="space-y-5 animate-fade-in">

          {/* Survey selector — shared with the Questions tab */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value || null)}
                className="h-9 px-3 text-sm rounded-xl border border-border bg-card text-foreground
                           outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
              >
                <option value="">— Select a survey —</option>
                {overview.surveys.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
            {themes && (
              <span className="text-sm text-muted-foreground">
                {themes.questions.length} open-text question{themes.questions.length !== 1 ? "s" : ""} ·{" "}
                {themes.labels.length} theme{themes.labels.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {!selectedId ? (
            <div className="py-24 text-center text-muted-foreground">
              <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a survey to begin thematic coding of its open-text answers.</p>
            </div>
          ) : themesLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading themes…
            </div>
          ) : !themes ? (
            <div className="py-24 text-center text-muted-foreground text-sm">
              Failed to load theme data.
            </div>
          ) : themes.questions.length === 0 ? (
            <div className="py-24 text-center text-muted-foreground text-sm">
              This survey has no open-text questions to code.
            </div>
          ) : (
            <div className="grid lg:grid-cols-[1fr_280px] gap-5">

              {/* ── Answers + inline coding ────────────────────────────────── */}
              <div className="space-y-4">
                {themes.questions.map((q) => (
                  <Card key={q.id} className="border-border shadow-card">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {q.section_title && (
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                              {q.section_title}
                            </p>
                          )}
                          <CardTitle className="text-sm font-heading leading-snug">
                            {q.question_text}
                          </CardTitle>
                        </div>
                        <Badge className="bg-muted text-muted-foreground border text-xs flex-shrink-0">
                          {q.answer_count} answer{q.answer_count !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {q.answers.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No open-text answers yet.</p>
                      ) : q.answers
                        .filter((a) => !labelFilter || a.codes.some((c) => c.label === labelFilter))
                        .map((a) => {
                          const draft = newLabelByAnswer[a.id] ?? "";
                          return (
                            <div key={a.id} className="rounded-xl border border-border bg-surface-alt/30 p-3 space-y-2">
                              <p className="text-sm text-foreground whitespace-pre-line">
                                “{a.text}”
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {a.codes.map((c) => (
                                  <span
                                    key={c.label}
                                    className={cn(
                                      "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border",
                                      c.agreed
                                        ? "bg-success/10 text-success border-success/30"
                                        : "bg-accent/10 text-accent-foreground border-accent/30"
                                    )}
                                    title={c.coders.map((co) => co.name).join(", ")}
                                  >
                                    <Tag className="w-2.5 h-2.5" />
                                    {c.label}
                                    {c.coders.length > 1 && (
                                      <span className="text-[10px] text-muted-foreground">×{c.coders.length}</span>
                                    )}
                                    {/* Remove only your own code applications. We
                                        send each one separately so the API can
                                        check ownership per-row. */}
                                    {c.code_ids.map((codeId) => (
                                      <button
                                        key={codeId}
                                        onClick={() => removeCode(codeId)}
                                        className="ml-0.5 opacity-50 hover:opacity-100"
                                        title="Remove this code (yours only)"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    ))}
                                  </span>
                                ))}
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    applyCode(a.id, draft);
                                  }}
                                  className="inline-flex items-center gap-1"
                                >
                                  <Input
                                    list={`labels-${q.id}`}
                                    value={draft}
                                    onChange={(e) => setNewLabelByAnswer((m) => ({ ...m, [a.id]: e.target.value }))}
                                    placeholder="add code…"
                                    className="h-6 w-32 text-xs px-2 focus-visible:ring-primary/30"
                                  />
                                  <button
                                    type="submit"
                                    disabled={codingAnswerId === a.id || !draft.trim()}
                                    className="h-6 px-2 rounded-full border border-primary/30 text-primary text-[11px] hover:bg-primary/5 disabled:opacity-40"
                                  >
                                    {codingAnswerId === a.id ? "…" : <Plus className="w-3 h-3" />}
                                  </button>
                                </form>
                              </div>
                              {a.submitted_at && (
                                <p className="text-[10px] text-muted-foreground">
                                  Submitted {new Date(a.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </p>
                              )}
                            </div>
                          );
                        })}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── Theme frequency sidebar ─────────────────────────────────── */}
              <div className="space-y-3">
                <Card className="border-border shadow-card lg:sticky lg:top-20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-heading">Themes</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Click a theme to filter answers. Themes coded by 2+ researchers show inter-rater agreement.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-1">
                    {themes.labels.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2">
                        No themes yet. Start tagging answers with a short label like “access”, “stress”, or “livelihood”.
                      </p>
                    ) : (
                      <>
                        {labelFilter && (
                          <button
                            onClick={() => setLabelFilter("")}
                            className="text-xs text-primary hover:underline mb-1"
                          >
                            Clear filter ({labelFilter})
                          </button>
                        )}
                        {themes.labels.map((l) => (
                          <button
                            key={l.label}
                            onClick={() => setLabelFilter((cur) => cur === l.label ? "" : l.label)}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-sm border transition-colors",
                              labelFilter === l.label
                                ? "bg-primary/10 text-primary border-primary/30"
                                : "border-transparent hover:bg-muted text-foreground"
                            )}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <Tag className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{l.label}</span>
                              {l.coder_count >= 2 && (
                                <Badge className="bg-success/10 text-success border-success/20 border text-[10px] px-1 py-0">
                                  agreed
                                </Badge>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">{l.count}</span>
                          </button>
                        ))}
                        {/* Datalist powers the inline label autocomplete on each answer. */}
                        {themes.questions.map((q) => (
                          <datalist key={`dl-${q.id}`} id={`labels-${q.id}`}>
                            {themes.labels.map((l) => <option key={l.label} value={l.label} />)}
                          </datalist>
                        ))}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

            </div>
          )}
        </div>
      )}

    </div>
  );
}
