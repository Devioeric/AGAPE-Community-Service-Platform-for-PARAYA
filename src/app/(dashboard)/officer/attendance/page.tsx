"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  QrCode, RefreshCw, Loader2, Calendar, MapPin, Users, Clock,
  CheckCircle2, AlertTriangle, Copy, ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActivityRow {
  id:               string;
  title:            string;
  date:             string | null;
  status:           string;
  program:          { id: string; title: string; status: string; barangays: { name: string } | null } | null;
  attendance_otp:   string | null;
  otp_issued_at:    string | null;
  otp_expires_at:   string | null;
  otp_active:       boolean;
  check_in_count:   number;
}

interface RosterEntry {
  id:            string;
  checked_in_at: string;
  method:        "qr" | "otp" | "manual";
  volunteer:     { id: string; full_name: string; email: string } | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function relativeFromNow(iso: string | null) {
  if (!iso) return "—";
  const diffMs = new Date(iso).getTime() - Date.now();
  const sign   = diffMs >= 0 ? "in" : "ago";
  const absMin = Math.round(Math.abs(diffMs) / 60_000);
  if (absMin < 60)        return sign === "in" ? `in ${absMin} min` : `${absMin} min ago`;
  const absHr = Math.round(absMin / 60);
  if (absHr  < 24)        return sign === "in" ? `in ${absHr} hr` : `${absHr} hr ago`;
  const absDay = Math.round(absHr / 24);
  return sign === "in" ? `in ${absDay} day${absDay === 1 ? "" : "s"}` : `${absDay} day${absDay === 1 ? "" : "s"} ago`;
}

function qrUrl(otp: string, size = 280): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const checkInUrl = `${base}/volunteer/check-in?otp=${encodeURIComponent(otp)}`;
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(checkInUrl)}&size=${size}x${size}&margin=10&color=2C2416&bgcolor=FAFAF7`;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function OfficerAttendancePage() {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roster, setRoster]         = useState<RosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rotating, setRotating]     = useState(false);

  // ── Fetch activities ─────────────────────────────────────────────────────

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/officer/attendance");
    if (res.ok) {
      const j = await res.json();
      setActivities(j.data ?? []);
    } else {
      toast.error("Failed to load activities.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const selected = useMemo(
    () => activities.find((a) => a.id === selectedId) ?? null,
    [activities, selectedId]
  );

  // Auto-select first activity once loaded
  useEffect(() => {
    if (!selectedId && activities.length > 0) {
      setSelectedId(activities[0]!.id);
    }
  }, [selectedId, activities]);

  // ── Fetch roster for selected ────────────────────────────────────────────

  const fetchRoster = useCallback(async (activity: ActivityRow) => {
    if (!activity.program?.id) return;
    setRosterLoading(true);
    const res = await fetch(`/api/programs/${activity.program.id}/activities/${activity.id}/attendance`);
    if (res.ok) {
      const j = await res.json();
      setRoster(j.data?.roster ?? []);
    } else {
      setRoster([]);
    }
    setRosterLoading(false);
  }, []);

  useEffect(() => {
    if (selected) fetchRoster(selected);
    else          setRoster([]);
  }, [selected, fetchRoster]);

  // ── Rotate OTP ───────────────────────────────────────────────────────────

  async function rotate() {
    if (!selected?.program?.id) return;
    setRotating(true);
    const res = await fetch(
      `/api/programs/${selected.program.id}/activities/${selected.id}/rotate-token`,
      { method: "POST" }
    );
    if (res.ok) {
      toast.success("New attendance code generated.");
      fetchActivities();
    } else {
      toast.error("Failed to rotate code.");
    }
    setRotating(false);
  }

  // ── Copy helpers ─────────────────────────────────────────────────────────

  function copyText(text: string, label: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard.`);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-primary" /> Attendance — QR &amp; OTP
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generate an attendance code per activity. Volunteers scan the QR code or enter the 6-character OTP to check in.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

        {/* ── Activity selector ─────────────────────────────────────────── */}
        <Card className="border-border shadow-card lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto scrollbar-thin">
          <CardHeader className="pb-3 sticky top-0 bg-card z-10 border-b border-border">
            <CardTitle className="font-heading text-base">Activities</CardTitle>
            <p className="text-xs text-muted-foreground">
              Within ±14 days of today. Select one to manage attendance.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              </div>
            ) : activities.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-xs">
                No activities in this window.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {activities.map((a) => (
                  <li
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedId === a.id ? "bg-primary/5 border-l-4 border-l-primary" : "hover:bg-surface-alt/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-foreground line-clamp-1">{a.title}</p>
                      {a.otp_active && (
                        <Badge className="bg-success/10 text-success border-success/20 border text-[10px] flex-shrink-0">
                          Live
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{a.program?.title ?? "—"}</p>
                    <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {fmtDate(a.date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {a.check_in_count}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Right pane: OTP + roster ──────────────────────────────────── */}
        {!selected ? (
          <Card className="border-border shadow-card">
            <CardContent className="py-20 text-center text-muted-foreground">
              <ScanLine className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="text-sm">Select an activity from the list.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">

            {/* Activity header card */}
            <Card className="border-border shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <CardTitle className="font-heading text-lg">{selected.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{selected.program?.title ?? "—"}</span>
                      {selected.program?.barangays?.name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {selected.program.barangays.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {fmtDate(selected.date)}
                      </span>
                    </div>
                  </div>
                  <Badge className={selected.otp_active
                    ? "bg-success/10 text-success border-success/20 border"
                    : "bg-muted text-muted-foreground border"
                  }>
                    {selected.otp_active ? "Code active" : "No active code"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* OTP block */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attendance Code</p>
                    {selected.attendance_otp ? (
                      <>
                        <div
                          className="font-mono text-4xl sm:text-5xl font-bold tracking-[0.25em] text-primary-dark bg-surface-alt border border-border rounded-xl py-4 px-3 text-center cursor-pointer hover:bg-surface-alt/70 transition-colors select-all"
                          onClick={() => copyText(selected.attendance_otp!, "OTP")}
                          title="Click to copy"
                        >
                          {selected.attendance_otp}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {selected.otp_active ? (
                            <span>Expires {relativeFromNow(selected.otp_expires_at)}</span>
                          ) : (
                            <span className="text-warning flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Expired — rotate to issue a new code
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="border-2 border-dashed border-border rounded-xl py-6 text-center text-sm text-muted-foreground">
                        No code yet. Press <strong>Rotate</strong> below to generate one.
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={rotate}
                        disabled={rotating}
                        className="bg-primary hover:bg-primary-dark text-white gap-1.5 flex-1"
                      >
                        <RefreshCw className={`w-4 h-4 ${rotating ? "animate-spin" : ""}`} />
                        {selected.attendance_otp ? "Rotate Code" : "Generate Code"}
                      </Button>
                      {selected.attendance_otp && (
                        <Button
                          variant="outline"
                          onClick={() => copyText(selected.attendance_otp!, "OTP")}
                          className="gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Show the QR code at the venue or read the code aloud. Volunteers can also visit <code className="text-foreground bg-muted px-1 py-0.5 rounded">/volunteer/check-in</code> to enter it manually.
                    </p>
                  </div>

                  {/* QR block */}
                  <div className="flex flex-col items-center justify-center">
                    {selected.attendance_otp ? (
                      <div className="bg-white p-2 rounded-xl border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={qrUrl(selected.attendance_otp)}
                          alt="Attendance QR code"
                          width={240}
                          height={240}
                        />
                      </div>
                    ) : (
                      <div className="w-[240px] h-[240px] rounded-xl bg-surface-alt border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
                        <QrCode className="w-12 h-12 opacity-30" />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Scanning opens the check-in page with the code prefilled.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Roster */}
            <Card className="border-border shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-heading text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Checked In
                    <Badge className="bg-muted text-muted-foreground border-0 text-[10px] ml-1">
                      {roster.length}
                    </Badge>
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selected && fetchRoster(selected)}
                    disabled={rosterLoading}
                    className="gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rosterLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {rosterLoading ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  </div>
                ) : roster.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No check-ins yet.
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {roster.map((r) => (
                      <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {r.volunteer?.full_name ?? "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">{r.volunteer?.email ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`text-[10px] capitalize ${
                            r.method === "manual"
                              ? "bg-muted text-muted-foreground border border-border"
                              : "bg-success/10 text-success border-success/20 border"
                          }`}>
                            {r.method === "manual" ? "manual" : r.method}
                          </Badge>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3 inline mr-1 text-success" />
                            {fmtTime(r.checked_in_at)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
