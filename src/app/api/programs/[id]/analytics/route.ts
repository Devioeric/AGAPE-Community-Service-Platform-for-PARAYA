import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/programs/[id]/analytics
// One-stop rollup for a single program — KPIs, activity timeline, volunteer
// hours, attendance, impact indicators, qualitative entries, follow-up
// status, and budget vs actual. Intended to back a dedicated per-program
// dashboard at /officer/programs/[id]/analytics.
//
// Implementation note: we deliberately do the math here (not in Postgres
// views) because the rollup spans seven tables — a SQL view would be brittle
// against the in-flight schema changes. All numbers are small (per program)
// so the JS aggregation is cheap.
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authorizeCapability("analytics.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const adminDb  = createAdminClient();

  const { id } = await params;

  // ── Parallel fetch ────────────────────────────────────────────────────────
  const [
    { data: program, error: progErr },
    { data: activities },
    { data: signups },
    { data: logs },
    { data: indicators },
    { data: qualitative },
    { data: followups },
    { data: budgets },
  ] = await Promise.all([
    adminDb
      .from("programs")
      .select("id, title, description, status, start_date, end_date, budget_allocated, barangays(name)")
      .eq("id", id)
      .single(),
    adminDb
      .from("program_activities")
      .select("id, title, date, status, attendance(count)")
      .eq("program_id", id)
      .order("date", { ascending: true }),
    adminDb
      .from("program_signups")
      .select("status")
      .eq("program_id", id),
    adminDb
      .from("activity_logs")
      .select("hours, date, status")
      .eq("program_id", id),
    adminDb
      .from("impact_indicators")
      .select("id, indicator_type, value, unit, recorded_date, notes")
      .eq("program_id", id)
      .is("voided_at", null)
      .order("recorded_date", { ascending: false }),
    adminDb
      .from("impact_qualitative")
      .select("id, type, content, subject_name, recorded_date")
      .eq("program_id", id)
      .is("voided_at", null)
      .order("recorded_date", { ascending: false }),
    adminDb
      .from("follow_up_records")
      .select("id, followup_type, status, scheduled_date, completed_date, notes")
      .eq("program_id", id)
      .is("voided_at", null),
    adminDb
      .from("program_budgets")
      .select("id, category, allocated, spent, notes")
      .eq("program_id", id),
  ]);

  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 });
  if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 });

  // ── Activity rollup ───────────────────────────────────────────────────────
  type ActivityRow = {
    id: string; title: string; date: string; status: string;
    attendance: { count: number }[] | { count: number } | null;
  };
  const acts = (activities ?? []) as ActivityRow[];
  const today = new Date().toISOString().slice(0, 10);

  // attendance() returns an aggregate row; defensively unwrap.
  const attendanceCount = (a: ActivityRow) =>
    Array.isArray(a.attendance) ? (a.attendance[0]?.count ?? 0) : (a.attendance?.count ?? 0);

  const activityRows = acts.map((a) => ({
    id:         a.id,
    title:      a.title,
    date:       a.date,
    status:     a.status,
    is_past:    a.date < today,
    attendance: attendanceCount(a),
  }));

  const totalAttendance = activityRows.reduce((s, a) => s + a.attendance, 0);
  const activitiesByStatus = activityRows.reduce<Record<string, number>>((m, a) => {
    m[a.status] = (m[a.status] ?? 0) + 1;
    return m;
  }, {});

  // ── Signup rollup ─────────────────────────────────────────────────────────
  type SignupRow = { status: string };
  const signupRows = (signups ?? []) as SignupRow[];
  const signupsByStatus = signupRows.reduce<Record<string, number>>((m, s) => {
    m[s.status] = (m[s.status] ?? 0) + 1;
    return m;
  }, {});
  const activeSignups = signupRows.filter((s) => s.status !== "withdrawn").length;

  // ── Hours rollup (approved logs only count toward effort) ─────────────────
  type LogRow = { hours: number | null; date: string; status: string };
  const logRows = (logs ?? []) as LogRow[];
  const approvedHours = logRows
    .filter((l) => l.status === "approved")
    .reduce((s, l) => s + (l.hours ?? 0), 0);
  const pendingHours = logRows
    .filter((l) => l.status === "pending")
    .reduce((s, l) => s + (l.hours ?? 0), 0);

  // Hours by month (last 6 months), zero-seeded so the chart starts level.
  const now = new Date();
  const hoursByMonth = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    hoursByMonth.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
  }
  logRows
    .filter((l) => l.status === "approved" && l.date)
    .forEach((l) => {
      const key = l.date.slice(0, 7);
      if (hoursByMonth.has(key)) hoursByMonth.set(key, (hoursByMonth.get(key) ?? 0) + (l.hours ?? 0));
    });
  const hours_timeline = Array.from(hoursByMonth.entries()).map(([k, hours]) => ({
    month: new Date(k + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    hours,
  }));

  // ── Follow-up rollup per stage ────────────────────────────────────────────
  type FollowRow = {
    id: string; followup_type: string; status: string;
    scheduled_date: string; completed_date: string | null; notes: string | null;
  };
  const followRows = (followups ?? []) as FollowRow[];
  const stageRollup = (["immediate", "6_month", "12_month"] as const).map((stage) => {
    const all       = followRows.filter((f) => f.followup_type === stage);
    const completed = all.filter((f) => f.status === "completed").length;
    return { stage, total: all.length, completed };
  });

  // ── Budget rollup ─────────────────────────────────────────────────────────
  type BudgetRow = {
    id: string; category: string;
    allocated: number | null; spent: number | null; notes: string | null;
  };
  const budgetRows = (budgets ?? []) as BudgetRow[];
  const plannedTotal = budgetRows.reduce((s, b) => s + (b.allocated ?? 0), 0);
  const actualTotal  = budgetRows.reduce((s, b) => s + (b.spent  ?? 0), 0);

  // ── Impact rollups ────────────────────────────────────────────────────────
  type IndicatorRow = {
    id: string; indicator_type: string; value: number | null; unit: string;
    recorded_date: string; notes: string | null;
  };
  type QualRow = {
    id: string; type: string; content: string;
    subject_name: string | null; recorded_date: string;
  };
  const indicatorRows = (indicators ?? []) as IndicatorRow[];
  const qualRows      = (qualitative ?? []) as QualRow[];

  // Sum of all quantitative indicators bucketed by indicator_type — useful for
  // the headline "23 beneficiaries reached, 4 trainings conducted" tiles.
  const indicatorTotals = indicatorRows.reduce<Record<string, { value: number; unit: string }>>((m, r) => {
    const prev = m[r.indicator_type] ?? { value: 0, unit: r.unit };
    prev.value += r.value ?? 0;
    m[r.indicator_type] = prev;
    return m;
  }, {});

  const qualByType = qualRows.reduce<Record<string, number>>((m, r) => {
    m[r.type] = (m[r.type] ?? 0) + 1;
    return m;
  }, {});

  return NextResponse.json({
    data: {
      program: {
        id:                   program.id,
        title:                program.title,
        description:          program.description,
        status:               program.status,
        start_date:           program.start_date,
        end_date:             program.end_date,
        budget:               program.budget_allocated,
        target_beneficiaries: null,
        barangay_name:        (program.barangays as unknown as { name: string } | null)?.name ?? null,
      },
      kpis: {
        activities_total:     activityRows.length,
        activities_completed: activityRows.filter((a) => a.status === "completed").length,
        attendance_total:     totalAttendance,
        signups_active:       activeSignups,
        hours_approved:       Math.round(approvedHours * 10) / 10,
        hours_pending:        Math.round(pendingHours  * 10) / 10,
        budget_planned:       plannedTotal,
        budget_actual:        actualTotal,
        budget_utilization:   plannedTotal > 0 ? Math.round((actualTotal / plannedTotal) * 100) : 0,
      },
      activities:        activityRows,
      activities_by_status: activitiesByStatus,
      signups_by_status: signupsByStatus,
      hours_timeline,
      followups: {
        stages:  stageRollup,
        records: followRows.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
      },
      budget_lines: budgetRows,
      impact: {
        indicators:        indicatorRows,
        indicator_totals:  indicatorTotals,
        qualitative:       qualRows,
        qualitative_by_type: qualByType,
      },
    },
  });
}
