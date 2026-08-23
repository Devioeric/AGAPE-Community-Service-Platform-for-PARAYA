"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, ClipboardList, Users, Clock,
  Building2, Loader2, FileText, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExportMenu } from "@/components/shared/ExportMenu";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BarangayInfo {
  id:                string;
  name:              string;
  municipality:      string;
  province:          string;
  partnership_start: string | null;
  is_active:         boolean;
}

interface ProgramRow {
  id:         string;
  title:      string;
  status:     string;
  start_date: string | null;
  end_date:   string | null;
}

interface NeedRow {
  id:          string;
  category:    string;
  title:       string | null;
  description: string | null;
  priority:    string | null;
  created_at:  string;
  resolved:    boolean | null;
}

interface SurveyResponseRow {
  id:           string;
  survey_id:    string;
  survey_title: string;
  submitted_at: string;
}

interface ReportData {
  barangay: BarangayInfo;
  summary: {
    programCount:        number;
    activeProgramCount:  number;
    completedCount:      number;
    needsCount:          number;
    unresolvedNeeds:     number;
    totalVolunteerHours: number;
    totalActivities:     number;
    surveyResponses:     number;
  };
  programsByStatus: Record<string, number>;
  needsByCategory:  Record<string, number>;
  programs:        ProgramRow[];
  needs:           NeedRow[];
  surveyResponses: SurveyResponseRow[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROGRAM_BADGE: Record<string, string> = {
  planning:  "bg-info/10 text-info border-info/20 border",
  active:    "bg-success/10 text-success border-success/20 border",
  completed: "bg-muted text-muted-foreground border",
  cancelled: "bg-danger/10 text-danger border-danger/20 border",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-danger/10 text-danger border-danger/20 border",
  high:     "bg-warning/10 text-warning border-warning/20 border",
  medium:   "bg-info/10 text-info border-info/20 border",
  low:      "bg-muted/30 text-muted-foreground border border-border",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BarangayReportsPage() {
  const [data, setData]       = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/barangay/reports");
    const j   = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error ?? "Failed to load reports.");
    } else if (!j.data) {
      setError(j.error ?? "No barangay assigned.");
    } else {
      setData(j.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading report…
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-border shadow-card">
        <CardContent className="py-16 text-center text-muted-foreground space-y-2">
          <Building2 className="w-10 h-10 mx-auto opacity-30" />
          <p className="text-sm">{error ?? "No report available."}</p>
        </CardContent>
      </Card>
    );
  }

  const { barangay, summary } = data;

  // Build the export rows for each section
  const programExportRows = data.programs.map((p) => ({
    Title:     p.title,
    Status:    p.status,
    "Start Date": fmtDate(p.start_date),
    "End Date":   fmtDate(p.end_date),
  }));

  const needsExportRows = data.needs.map((n) => ({
    Category:    n.category,
    Title:       n.title ?? "",
    Description: n.description ?? "",
    Priority:    n.priority ?? "",
    Submitted:   fmtDate(n.created_at),
    Resolved:    n.resolved ? "Yes" : "No",
  }));

  const surveyExportRows = data.surveyResponses.map((r) => ({
    Survey:    r.survey_title,
    Submitted: fmtDate(r.submitted_at),
  }));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> {barangay.name}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {barangay.municipality}, {barangay.province} · Partner since {fmtDate(barangay.partnership_start)}
          </p>
        </div>
        <Badge className={barangay.is_active
          ? "bg-success/10 text-success border-success/20 border"
          : "bg-muted text-muted-foreground border"
        }>
          {barangay.is_active ? "Active Partnership" : "Inactive"}
        </Badge>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Programs",   value: summary.programCount,        sub: `${summary.activeProgramCount} active · ${summary.completedCount} completed`, icon: Activity,        accent: "border-l-primary" },
          { label: "Volunteer Hours",  value: summary.totalVolunteerHours, sub: `${summary.totalActivities} approved activities`,                              icon: Clock,           accent: "border-l-accent"  },
          { label: "Community Needs",  value: summary.needsCount,          sub: `${summary.unresolvedNeeds} unresolved`,                                       icon: ClipboardList,   accent: "border-l-warning" },
          { label: "Survey Responses", value: summary.surveyResponses,     sub: "received from this barangay",                                                 icon: Users,           accent: "border-l-info"    },
        ].map(({ label, value, sub, icon: Icon, accent }) => (
          <Card key={label} className={`border-border shadow-card border-l-4 ${accent}`}>
            <CardContent className="px-5 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
              <p className="text-2xl font-bold font-heading text-foreground leading-tight mt-0.5">
                {typeof value === "number" ? value.toLocaleString() : value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Programs */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Programs
            </CardTitle>
            <ExportMenu
              rows={programExportRows}
              filename={`${barangay.name}-programs`}
              sheetName="Programs"
              compact
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.programs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No programs hosted yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border bg-surface-alt/50">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Title</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden sm:table-cell">Start</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">End</th>
                  </tr>
                </thead>
                <tbody>
                  {data.programs.map((p, i) => (
                    <tr key={p.id} className={`border-b border-border/60 ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                      <td className="py-3 px-4 font-medium text-foreground">{p.title}</td>
                      <td className="py-3 px-4">
                        <Badge className={`${PROGRAM_BADGE[p.status] ?? "bg-muted text-muted-foreground border"} text-[10px] capitalize`}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{fmtDate(p.start_date)}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{fmtDate(p.end_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Community Needs */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" /> Community Needs
            </CardTitle>
            <ExportMenu
              rows={needsExportRows}
              filename={`${barangay.name}-needs`}
              sheetName="Community Needs"
              compact
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.needs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No needs submitted from this barangay yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border bg-surface-alt/50">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Category</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Description</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Priority</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Submitted</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.needs.map((n, i) => (
                    <tr key={n.id} className={`border-b border-border/60 ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                      <td className="py-3 px-4 capitalize text-foreground">{n.category}</td>
                      <td className="py-3 px-4 text-muted-foreground max-w-xs">
                        {n.title && <p className="text-foreground text-sm font-medium">{n.title}</p>}
                        {n.description && <p className="text-xs line-clamp-1">{n.description}</p>}
                      </td>
                      <td className="py-3 px-4">
                        {n.priority ? (
                          <Badge className={`${PRIORITY_BADGE[n.priority] ?? "bg-muted text-muted-foreground border"} text-[10px] capitalize`}>
                            {n.priority}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground/50">—</span>}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap hidden md:table-cell">{fmtDate(n.created_at)}</td>
                      <td className="py-3 px-4">
                        {n.resolved
                          ? <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="w-3.5 h-3.5" /> Resolved</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-warning"><AlertCircle className="w-3.5 h-3.5" /> Pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Survey responses */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Survey Responses
            </CardTitle>
            <ExportMenu
              rows={surveyExportRows}
              filename={`${barangay.name}-survey-responses`}
              sheetName="Survey Responses"
              compact
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.surveyResponses.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No survey responses from this barangay yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border bg-surface-alt/50">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Survey</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.surveyResponses.map((r, i) => (
                    <tr key={r.id} className={`border-b border-border/60 ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                      <td className="py-3 px-4 text-foreground">{r.survey_title}</td>
                      <td className="py-3 px-4 text-muted-foreground">{fmtDate(r.submitted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center print-hidden">
        Use the Export menus to download Excel/CSV files or print this page as a PDF.
        <br />Reports show data scoped to {barangay.name} only.
      </p>
    </div>
  );
}
