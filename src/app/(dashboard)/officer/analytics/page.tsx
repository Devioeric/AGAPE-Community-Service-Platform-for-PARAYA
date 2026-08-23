"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Loader2, TrendingUp, Users, Clock, Gift, FileText,
  BarChart3, MapPin, CalendarDays, X, SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  programs:  { total: number; byStatus: Record<string, number>; chartData: { status: string; count: number }[] };
  volunteers: { total: number; active: number };
  hours:      { total: number; byMonth: { month: string; hours: number }[] };
  donations:  { total: number; totalQty: number; totalDistributed: number; byType: { type: string; qty: number }[] };
  sdg:        { counts: { sdg: number; count: number }[] };
  needs:      { byCategory: { category: string; count: number }[] };
  proposals:  { total: number; byStatus: Record<string, number> };
  topBarangays: { name: string; count: number }[];
}

interface Barangay { id: string; name: string }

// ─── Constants ─────────────────────────────────────────────────────────────────

const SDG_META: Record<number, { label: string; color: string; goal: string }> = {
  4:  { label: "Quality Education",     color: "#C5192D", goal: "Education & Skills" },
  9:  { label: "Industry & Innovation", color: "#FD6925", goal: "Innovation & Infrastructure" },
  11: { label: "Sustainable Cities",    color: "#FD9D24", goal: "Community Development" },
  17: { label: "Partnerships",          color: "#19486A", goal: "Multi-sector Collaboration" },
};

const PROGRAM_STATUS_COLORS: Record<string, string> = {
  active:    "#4A7C59",
  upcoming:  "#5B7FA5",
  completed: "#6B5B3E",
  draft:     "#9C9488",
  cancelled: "#9B3B3B",
};

const NEEDS_COLORS = ["#6B5B3E", "#C4A96A", "#4A7C59", "#5B7FA5", "#9B3B3B", "#B8860B"];

const CHART_STYLE = {
  cartesianGrid: { strokeDasharray: "3 3", stroke: "#E5DDD0" },
  tooltip: {
    contentStyle: {
      background: "#FFFFFF", border: "1px solid #E5DDD0",
      borderRadius: "8px", fontSize: "12px", color: "#2C2416",
    },
  },
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 2023 }, (_, i) => CURRENT_YEAR - i);

// ─── Helpers ───────────────────────────────────────────────────────────────────

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const HBarLabel = ({ x, y, width, height, value }: { x?: number; y?: number; width?: number; height?: number; value?: number }) => (
  <text x={(x ?? 0) + (width ?? 0) + 6} y={(y ?? 0) + (height ?? 0) / 2 + 4} fontSize={11} fill="#6B6356">
    {value}
  </text>
);

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OfficerAnalyticsPage() {
  const [data, setData]           = useState<AnalyticsData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [barangays, setBarangays] = useState<Barangay[]>([]);

  // Applied filters — these drive the API call
  const [barangayId, setBarangayId] = useState("");
  const [year, setYear]             = useState("");

  // Draft filters — held in the Sheet until Apply is clicked
  const [filterOpen, setFilterOpen]             = useState(false);
  const [draftBarangayId, setDraftBarangayId]   = useState("");
  const [draftYear, setDraftYear]               = useState("");

  const fetchAnalytics = useCallback(async (bId: string, yr: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (bId) params.set("barangay_id", bId);
    if (yr)  params.set("year", yr);
    const res = await fetch(`/api/analytics?${params}`);
    if (res.ok) { const j = await res.json(); setData(j.data); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAnalytics(barangayId, year); }, [fetchAnalytics, barangayId, year]);

  useEffect(() => {
    fetch("/api/partnerships").then((r) => r.json()).then((j) => setBarangays(j.data ?? []));
  }, []);

  // Sync draft state with applied when opening the sheet
  const openFilters = () => {
    setDraftBarangayId(barangayId);
    setDraftYear(year);
    setFilterOpen(true);
  };

  const applyFilters = () => {
    setBarangayId(draftBarangayId);
    setYear(draftYear);
    setFilterOpen(false);
  };

  const resetFilters = () => {
    setDraftBarangayId("");
    setDraftYear("");
    setBarangayId("");
    setYear("");
    setFilterOpen(false);
  };

  const activeFilterCount     = [barangayId, year].filter(Boolean).length;
  const selectedBarangayName  = barangays.find((b) => b.id === barangayId)?.name ?? "";
  const hoursChartTitle       = year ? `Volunteer Hours — ${year}` : "Volunteer Hours — Last 6 Months";

  // ── Portal: render Filters button into the shared header slot ──────────────
  const [headerSlot, setHeaderSlot] = useState<Element | null>(null);
  useEffect(() => {
    setHeaderSlot(document.getElementById("header-actions-slot"));
  }, []);

  const FiltersButton = (
    <button
      onClick={openFilters}
      className="relative flex items-center gap-2 h-9 px-3.5 rounded-xl border border-border
                 bg-card text-sm font-medium text-foreground hover:bg-secondary
                 transition-all duration-150 shadow-sm"
    >
      <SlidersHorizontal className="w-4 h-4" />
      Filters
      {activeFilterCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary
                         text-white text-[10px] font-bold flex items-center justify-center">
          {activeFilterCount}
        </span>
      )}
    </button>
  );

  // ── Active filter chips ─────────────────────────────────────────────────────
  const FilterChips = (barangayId || year) ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Active filters:</span>
      {barangayId && (
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          {selectedBarangayName}
          <button
            onClick={() => setBarangayId("")}
            className="ml-0.5 hover:opacity-60 transition-opacity"
            aria-label="Remove barangay filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}
      {year && (
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <CalendarDays className="w-3 h-3 flex-shrink-0" />
          {year}
          <button
            onClick={() => setYear("")}
            className="ml-0.5 hover:opacity-60 transition-opacity"
            aria-label="Remove year filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}
      <button
        onClick={() => { setBarangayId(""); setYear(""); }}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
      >
        Clear all
      </button>
    </div>
  ) : null;

  // ── Filter Sheet ────────────────────────────────────────────────────────────
  const FilterSheet = (
    <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
      <SheetContent side="right" className="w-80 sm:w-[360px] flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="font-heading text-lg">Filter Analytics</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Narrow the data shown across all charts and metrics.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7">

          {/* Barangay */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-1">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              Partner Barangay
            </label>
            <p className="text-xs text-muted-foreground mb-3">
              Focus all metrics on a single partner barangay
            </p>
            <select
              value={draftBarangayId}
              onChange={(e) => setDraftBarangayId(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-xl border border-border bg-card text-foreground
                         outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 cursor-pointer"
            >
              <option value="">All Barangays</option>
              {barangays.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-border" />

          {/* Year */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-1">
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
              Calendar Year
            </label>
            <p className="text-xs text-muted-foreground mb-3">
              Show data from a specific year; leave blank to see all time
            </p>
            <select
              value={draftYear}
              onChange={(e) => setDraftYear(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-xl border border-border bg-card text-foreground
                         outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 cursor-pointer"
            >
              <option value="">All Years</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-border" />

          {/* Summary of selection */}
          {(draftBarangayId || draftYear) && (
            <div className="rounded-xl bg-secondary border border-border px-4 py-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground text-xs mb-1.5">Filter preview</p>
              {draftBarangayId && (
                <p>
                  Barangay:{" "}
                  <span className="font-medium text-foreground">
                    {barangays.find((b) => b.id === draftBarangayId)?.name ?? "—"}
                  </span>
                </p>
              )}
              {draftYear && (
                <p>
                  Year: <span className="font-medium text-foreground">{draftYear}</span>
                </p>
              )}
            </div>
          )}

        </div>

        <SheetFooter className="flex-col gap-2.5 px-6 py-5 border-t border-border">
          <button
            onClick={applyFilters}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold
                       hover:bg-primary/90 transition-all duration-150 active:scale-[0.97]"
          >
            Apply Filters
          </button>
          <button
            onClick={resetFilters}
            className="w-full h-10 rounded-xl border border-border bg-card text-sm font-medium text-foreground
                       hover:bg-secondary transition-all duration-150 active:scale-[0.97]"
          >
            Reset All
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {headerSlot && createPortal(FiltersButton, headerSlot)}
        {FilterChips}
        {FilterSheet}
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading analytics…</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {headerSlot && createPortal(FiltersButton, headerSlot)}
        {FilterChips}
        {FilterSheet}
        <div className="py-32 text-center text-muted-foreground">
          Failed to load analytics data. Please refresh.
        </div>
      </div>
    );
  }

  const maxSdgCount = Math.max(...data.sdg.counts.map((s) => s.count), 1);

  return (
    <div className="space-y-8">

      {headerSlot && createPortal(FiltersButton, headerSlot)}
      {FilterChips}
      {FilterSheet}

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Programs", value: data.programs.total,
            sub: `${data.programs.byStatus.active ?? 0} active`,
            icon: BarChart3, accent: "border-l-primary",
          },
          {
            label: "Volunteers", value: data.volunteers.total,
            sub: `${data.volunteers.active} active`,
            icon: Users, accent: "border-l-success",
          },
          {
            label: "Approved Hours", value: data.hours.total.toLocaleString(),
            sub: barangayId ? `in ${selectedBarangayName}` : "volunteer service hours",
            icon: Clock, accent: "border-l-accent",
          },
          {
            label: "Donation Records", value: data.donations.total,
            sub: `${data.donations.totalQty.toLocaleString()} items received`,
            icon: Gift, accent: "border-l-info",
          },
        ].map(({ label, value, sub, icon: Icon, accent }) => (
          <Card key={label} className={`border-border shadow-card border-l-4 ${accent}`}>
            <CardContent className="px-5 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
              <p className="text-3xl font-bold font-heading text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── SDG Impact Tracker ───────────────────────────────────────────────── */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          SDG Impact Tracker
          {barangayId && (
            <span className="text-sm font-normal text-muted-foreground">
              · {selectedBarangayName}
            </span>
          )}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.sdg.counts.map(({ sdg, count }) => {
            const meta = SDG_META[sdg];
            const pct  = Math.round((count / maxSdgCount) * 100);
            return (
              <Card key={sdg} className="border-border shadow-card border-t-4" style={{ borderTopColor: meta.color }}>
                <CardContent className="px-5 pt-4 pb-4">
                  <div
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold text-white mb-3"
                    style={{ backgroundColor: meta.color }}
                  >
                    SDG {sdg}
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-tight mb-0.5">{meta.label}</p>
                  <p className="text-xs text-muted-foreground mb-3">{meta.goal}</p>
                  <p className="text-2xl font-bold font-heading text-foreground mb-1">{count}</p>
                  <p className="text-xs text-muted-foreground mb-2">aligned proposals</p>
                  <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: meta.color }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Monthly Hours + Program Status ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <Card className="border-border shadow-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> {hoursChartTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.hours.byMonth} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid {...CHART_STYLE.cartesianGrid} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                <Tooltip {...CHART_STYLE.tooltip} formatter={(v) => [`${Number(v)} hrs`, "Hours"]} />
                <Bar dataKey="hours" fill="#6B5B3E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Programs by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.programs.chartData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No program data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data.programs.chartData} dataKey="count" nameKey="status"
                    cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}
                  >
                    {data.programs.chartData.map((entry) => (
                      <Cell key={entry.status} fill={PROGRAM_STATUS_COLORS[entry.status] ?? "#9C9488"} />
                    ))}
                  </Pie>
                  <Tooltip {...CHART_STYLE.tooltip} formatter={(v, name) => [Number(v), cap(String(name))]} />
                  <Legend
                    iconType="circle" iconSize={8}
                    formatter={(value) => <span style={{ fontSize: 11, color: "#6B6356" }}>{cap(value)}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Donations + Needs ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" /> Donations by Item Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.donations.byType.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No donation data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.donations.byType} layout="vertical" margin={{ top: 5, right: 40, left: 8, bottom: 5 }}>
                  <CartesianGrid {...CHART_STYLE.cartesianGrid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="type" width={90} tick={{ fontSize: 11, fill: "#6B6356" }} axisLine={false} tickLine={false} />
                  <Tooltip {...CHART_STYLE.tooltip} formatter={(v) => [Number(v).toLocaleString(), "Qty"]} />
                  <Bar dataKey="qty" fill="#C4A96A" radius={[0, 4, 4, 0]} label={<HBarLabel />} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Community Needs by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.needs.byCategory.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No needs data submitted yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data.needs.byCategory} dataKey="count" nameKey="category"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}
                  >
                    {data.needs.byCategory.map((entry, i) => (
                      <Cell key={entry.category} fill={NEEDS_COLORS[i % NEEDS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...CHART_STYLE.tooltip} formatter={(v, name) => [Number(v), String(name)]} />
                  <Legend
                    iconType="circle" iconSize={8}
                    formatter={(value) => <span style={{ fontSize: 11, color: "#6B6356" }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Barangays + Proposals ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base">
              {barangayId ? `${selectedBarangayName} — Programs` : "Top Barangays by Programs"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.topBarangays.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No program–barangay data yet</div>
            ) : (
              <div className="space-y-3">
                {data.topBarangays.map(({ name, count }, i) => {
                  const max = data.topBarangays[0]?.count ?? 1;
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-foreground truncate">{name}</p>
                          <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                            {count} program{count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.round((count / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base">Proposal Pipeline Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {data.proposals.total === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No proposals submitted yet</div>
            ) : (
              <div className="space-y-3 pt-1">
                {[
                  { key: "approved",       label: "Approved",       color: "bg-success" },
                  { key: "finance_review", label: "Finance Review", color: "bg-accent" },
                  { key: "sdg_review",     label: "SDG Review",     color: "bg-info" },
                  { key: "pre_screening",  label: "Pre-screening",  color: "bg-warning" },
                  { key: "submitted",      label: "Submitted",      color: "bg-primary/60" },
                  { key: "draft",          label: "Draft",          color: "bg-muted-foreground/40" },
                  { key: "rejected",       label: "Rejected",       color: "bg-danger" },
                ].map(({ key, label, color }) => {
                  const count = data.proposals.byStatus[key] ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`} />
                      <p className="text-sm text-foreground flex-1">{label}</p>
                      <span className="text-sm font-semibold text-foreground">{count}</span>
                      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color} transition-all`}
                          style={{ width: `${Math.round((count / data.proposals.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-border flex justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold text-foreground">{data.proposals.total}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
