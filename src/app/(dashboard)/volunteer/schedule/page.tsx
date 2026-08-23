"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar as CalendarIcon, MapPin, Clock, Loader2, ChevronLeft,
  ChevronRight, Plus, Pencil, Trash2, BookOpen, X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ─── Types ──────────────────────────────────────────────────────────────────

type SignupStatus  = "pending" | "approved" | "withdrawn";
type ProgramStatus = "planning" | "active" | "completed" | "cancelled";

interface SignedProgram {
  id: string;
  status: SignupStatus;
  signed_up_at: string;
  programs: {
    id: string;
    title: string;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
    status: ProgramStatus;
    barangays: { name: string } | null;
  } | null;
}

interface ClassEntry {
  id:          string;
  subject:     string;
  day_of_week: number;
  start_time:  string;        // "HH:MM:SS"
  end_time:    string;
  location:    string | null;
  notes:       string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SIGNUP_BADGE: Record<SignupStatus, string> = {
  pending:   "bg-warning/10 text-warning border-warning/20 border",
  approved:  "bg-success/10 text-success border-success/20 border",
  withdrawn: "bg-muted text-muted-foreground border",
};

const PROGRAM_BADGE: Record<ProgramStatus, string> = {
  planning:  "bg-info/10 text-info border-info/20 border",
  active:    "bg-success/10 text-success border-success/20 border",
  completed: "bg-muted text-muted-foreground border",
  cancelled: "bg-danger/10 text-danger border-danger/20 border",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(t: string) {
  // "HH:MM:SS" → "h:mm AM/PM"
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour   = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function isSameYMD(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function VolunteerSchedulePage() {
  const [signups, setSignups]   = useState<SignedProgram[]>([]);
  const [classes, setClasses]   = useState<ClassEntry[]>([]);
  const [loading, setLoading]   = useState(true);

  // Calendar navigation
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Add/Edit class dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm] = useState({
    subject: "", day_of_week: 1, start_time: "08:00", end_time: "09:30",
    location: "", notes: "",
  });
  const [saving, setSaving]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [progRes, classRes] = await Promise.all([
      fetch("/api/programs"),
      fetch("/api/volunteer/classes"),
    ]);

    // Programs → signed-up programs
    if (progRes.ok) {
      const j = await progRes.json();
      const mine: SignedProgram[] = (j.data ?? [])
        .filter((p: { my_signup: unknown }) => p.my_signup)
        .map((p: {
          id: string; title: string; description: string | null;
          start_date: string | null; end_date: string | null;
          status: ProgramStatus; barangays: { name: string } | null;
          my_signup: { id: string; status: SignupStatus };
        }) => ({
          id:          p.my_signup.id,
          status:      p.my_signup.status,
          signed_up_at: "",
          programs: {
            id: p.id, title: p.title, description: p.description,
            start_date: p.start_date, end_date: p.end_date,
            status: p.status, barangays: p.barangays,
          },
        }));
      setSignups(mine);
    } else {
      toast.error("Failed to load programs.");
    }

    // Classes
    if (classRes.ok) {
      const j = await classRes.json();
      setClasses(j.data ?? []);
    } else {
      // Likely the table doesn't exist yet (migration not run) — silently empty
      setClasses([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Calendar grid ────────────────────────────────────────────────────────

  const calendarCells = useMemo(() => {
    const year   = cursor.getFullYear();
    const month  = cursor.getMonth();
    const first  = new Date(year, month, 1);
    const days   = new Date(year, month + 1, 0).getDate();
    const lead   = first.getDay();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  // Programs by ISO date string
  const programsByDate = useMemo(() => {
    const map = new Map<string, SignedProgram[]>();
    for (const s of signups) {
      const sd = s.programs?.start_date;
      if (!sd || s.status === "withdrawn") continue;
      const key = sd.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [signups]);

  // Classes by day_of_week
  const classesByDay = useMemo(() => {
    const map = new Map<number, ClassEntry[]>();
    for (const c of classes) {
      if (!map.has(c.day_of_week)) map.set(c.day_of_week, []);
      map.get(c.day_of_week)!.push(c);
    }
    return map;
  }, [classes]);

  const today = new Date();

  // ── Class dialog ─────────────────────────────────────────────────────────

  function openAdd() {
    setEditingId(null);
    setForm({ subject: "", day_of_week: 1, start_time: "08:00", end_time: "09:30", location: "", notes: "" });
    setDialogOpen(true);
  }

  function openEdit(c: ClassEntry) {
    setEditingId(c.id);
    setForm({
      subject:     c.subject,
      day_of_week: c.day_of_week,
      start_time:  c.start_time.slice(0, 5),
      end_time:    c.end_time.slice(0, 5),
      location:    c.location ?? "",
      notes:       c.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function saveClass() {
    if (!form.subject.trim()) {
      toast.error("Subject is required.");
      return;
    }
    if (form.end_time <= form.start_time) {
      toast.error("End time must be after start time.");
      return;
    }

    setSaving(true);
    const url    = editingId ? `/api/volunteer/classes/${editingId}` : "/api/volunteer/classes";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject:     form.subject.trim(),
        day_of_week: form.day_of_week,
        start_time:  form.start_time,
        end_time:    form.end_time,
        location:    form.location.trim() || null,
        notes:       form.notes.trim()    || null,
      }),
    });

    if (res.ok) {
      toast.success(editingId ? "Class updated." : "Class added.");
      setDialogOpen(false);
      fetchAll();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to save class.");
    }
    setSaving(false);
  }

  async function deleteClass(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/volunteer/classes/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Class removed.");
      setClasses((prev) => prev.filter((c) => c.id !== id));
    } else {
      toast.error("Failed to delete class.");
    }
    setDeletingId(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading schedule…
      </div>
    );
  }

  const active    = signups.filter((s) => s.programs?.status === "active"    && s.status !== "withdrawn");
  const upcoming  = signups.filter((s) => s.programs?.status === "planning"  && s.status !== "withdrawn");

  return (
    <div className="space-y-8">

      {/* ── Calendar ────────────────────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
            </CardTitle>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="w-8 h-8 rounded-lg hover:bg-surface-alt flex items-center justify-center transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="px-3 h-8 rounded-lg text-xs font-medium hover:bg-surface-alt transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="w-8 h-8 rounded-lg hover:bg-surface-alt flex items-center justify-center transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS_SHORT.map((d, i) => (
              <div
                key={d}
                className={`text-[11px] font-semibold uppercase tracking-wider text-center py-1 ${
                  i === 0 || i === 6 ? "text-danger/70" : "text-muted-foreground"
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((date, idx) => {
              if (!date) {
                return <div key={idx} className="min-h-[88px] rounded-lg bg-surface-alt/30" />;
              }
              const iso     = date.toISOString().slice(0, 10);
              const dow     = date.getDay();
              const isToday = isSameYMD(date, today);
              const isWknd  = dow === 0 || dow === 6;

              const progEvents  = programsByDate.get(iso) ?? [];
              const classEvents = classesByDay.get(dow)   ?? [];

              const totalEvents = progEvents.length + classEvents.length;
              const visible     = [
                ...progEvents.map((p) => ({ kind: "program" as const, item: p })),
                ...classEvents.map((c) => ({ kind: "class" as const, item: c })),
              ];
              const shown      = visible.slice(0, 3);
              const overflow   = totalEvents - shown.length;

              return (
                <div
                  key={idx}
                  className={`min-h-[88px] rounded-lg border p-1.5 flex flex-col gap-0.5 transition-colors ${
                    isToday
                      ? "border-primary bg-primary/5"
                      : isWknd
                        ? "border-border/60 bg-surface-alt/20"
                        : "border-border/60 bg-card hover:bg-surface-alt/40"
                  }`}
                >
                  <div className={`text-xs font-semibold ${
                    isToday ? "text-primary" : "text-foreground/80"
                  }`}>
                    {date.getDate()}
                  </div>
                  <div className="space-y-0.5 flex-1">
                    {shown.map((e, i) => e.kind === "program" ? (
                      <div
                        key={`p-${i}`}
                        className="text-[10px] leading-tight px-1.5 py-0.5 rounded bg-primary/10 text-primary truncate"
                        title={e.item.programs?.title}
                      >
                        {e.item.programs?.title}
                      </div>
                    ) : (
                      <div
                        key={`c-${i}`}
                        className="text-[10px] leading-tight px-1.5 py-0.5 rounded bg-accent/15 text-accent-foreground/80 truncate"
                        title={`${e.item.subject} · ${fmtTime(e.item.start_time)}`}
                      >
                        <span className="font-medium">{fmtTime(e.item.start_time).replace(" ", "")}</span> {e.item.subject}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="text-[10px] text-muted-foreground px-1.5">+{overflow} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/30" /> Program
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-accent/40" /> Class
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── My Class Schedule ──────────────────────────────────────────── */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" /> My Class Schedule
            </CardTitle>
            <Button
              onClick={openAdd}
              size="sm"
              className="bg-primary hover:bg-primary-dark text-white gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Class
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Enter your recurring class schedule so PARAYA officers can see when you&apos;re available.
          </p>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground space-y-2">
              <BookOpen className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-sm">No classes added yet.</p>
              <p className="text-xs">Click <strong>Add Class</strong> to record your weekly class times.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 font-medium">Day</th>
                    <th className="text-left py-2 font-medium">Time</th>
                    <th className="text-left py-2 font-medium">Subject</th>
                    <th className="text-left py-2 font-medium hidden sm:table-cell">Location</th>
                    <th className="py-2 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 text-foreground/80">{DAYS_LONG[c.day_of_week]}</td>
                      <td className="py-2.5 text-foreground/80 whitespace-nowrap">
                        {fmtTime(c.start_time)} – {fmtTime(c.end_time)}
                      </td>
                      <td className="py-2.5 font-medium text-foreground">{c.subject}</td>
                      <td className="py-2.5 text-muted-foreground hidden sm:table-cell">
                        {c.location ?? "—"}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(c)}
                            className="w-7 h-7 rounded-md hover:bg-surface-alt flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Edit class"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteClass(c.id)}
                            disabled={deletingId === c.id}
                            className="w-7 h-7 rounded-md hover:bg-danger/10 flex items-center justify-center text-muted-foreground hover:text-danger transition-colors disabled:opacity-40"
                            aria-label="Delete class"
                          >
                            {deletingId === c.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Program Assignments ────────────────────────────────────────── */}
      {(active.length > 0 || upcoming.length > 0) && (
        <Card className="border-border shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" /> Program Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { title: "Active",   items: active },
              { title: "Upcoming", items: upcoming },
            ].filter(s => s.items.length > 0).map((section) => (
              <div key={section.title} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h4>
                {section.items.map((s) => {
                  const prog = s.programs;
                  if (!prog) return null;
                  return (
                    <div
                      key={s.id}
                      className="flex items-start justify-between gap-3 p-3 rounded-lg bg-surface-alt/40 border border-border/60"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{prog.title}</p>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                          {prog.barangays && (
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{prog.barangays.name}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" />{fmtDate(prog.start_date)}{prog.end_date ? ` – ${fmtDate(prog.end_date)}` : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 items-end flex-shrink-0">
                        <Badge className={`${PROGRAM_BADGE[prog.status]} capitalize text-[10px]`}>{prog.status}</Badge>
                        <Badge className={`${SIGNUP_BADGE[s.status]} capitalize text-[10px]`}>{s.status}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Add/Edit Class Dialog ──────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" /> {editingId ? "Edit Class" : "Add Class"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cl-subject">Subject</Label>
              <Input
                id="cl-subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="e.g., CS101 Intro to Programming"
                className="focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cl-day">Day of week</Label>
              <select
                id="cl-day"
                value={form.day_of_week}
                onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })}
                className="w-full h-9 px-3 text-sm"
              >
                {DAYS_LONG.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cl-start">Start time</Label>
                <Input
                  id="cl-start"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  className="focus-visible:ring-primary/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-end">End time</Label>
                <Input
                  id="cl-end"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  className="focus-visible:ring-primary/30"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cl-location">Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="cl-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g., Building A Room 204"
                className="focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cl-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="cl-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any extra details…"
                className="focus-visible:ring-primary/30 resize-none text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <Button
              onClick={saveClass}
              disabled={saving}
              className="bg-primary hover:bg-primary-dark text-white"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving…</>
                : editingId ? "Update Class" : "Add Class"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
