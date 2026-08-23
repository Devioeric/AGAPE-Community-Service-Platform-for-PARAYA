import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // ── Date windows ────────────────────────────────────────────────────────────
  const now    = new Date();
  const year   = now.getFullYear();
  const month  = now.getMonth() + 1;
  // Simple two-semester split (PH academic): Aug–Dec = 1st sem, Jan–Jul = 2nd sem
  const semesterStart = month >= 8 ? `${year}-08-01` : `${year}-01-01`;
  const monthStart    = `${year}-${String(month).padStart(2, "0")}-01`;
  const today         = now.toISOString().slice(0, 10);
  const nextWeek      = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  // ── Parallel queries ────────────────────────────────────────────────────────
  const [
    semesterLogs,
    allSignups,
    notifications,
    recentLogs,
  ] = await Promise.all([
    admin.from("activity_logs")
      .select("hours, date, status")
      .eq("volunteer_id", user.id)
      .eq("status", "approved")
      .gte("date", semesterStart),

    // program_signups uses `signed_up_at`, not `created_at`.
    admin.from("program_signups")
      .select("id, signed_up_at, status, programs(start_date)")
      .eq("volunteer_id", user.id)
      .neq("status", "withdrawn"),

    admin.from("notifications")
      .select("id, type, title, message, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),

    admin.from("activity_logs")
      .select("id, date, hours, status, programs(title)")
      .eq("volunteer_id", user.id)
      .order("date", { ascending: false })
      .limit(5),
  ]);

  // ── Aggregate ───────────────────────────────────────────────────────────────
  const totalHours = (semesterLogs.data ?? []).reduce((s, l) => s + (l.hours ?? 0), 0);

  const signups            = allSignups.data ?? [];
  const activitiesJoined   = signups.length;
  const activitiesThisMonth = signups.filter(
    (s) => (s.signed_up_at ?? "") >= monthStart
  ).length;

  const upcomingEvents = signups.filter((s) => {
    const start = (s.programs as { start_date?: string } | null)?.start_date;
    return !!start && start >= today && start <= nextWeek;
  }).length;

  return NextResponse.json({
    data: {
      stats: {
        totalHours:         Math.round(totalHours * 10) / 10,
        activitiesJoined,
        activitiesThisMonth,
        upcomingEvents,
      },
      announcements: (notifications.data ?? []).map((n) => ({
        id:         n.id,
        type:       n.type,
        title:      n.title,
        message:    n.message,
        created_at: n.created_at,
      })),
      recentLogs: (recentLogs.data ?? []).map((l) => ({
        id:      l.id,
        date:    l.date,
        program: (l.programs as { title?: string } | null)?.title ?? "—",
        hours:   l.hours,
        status:  l.status,
      })),
    },
  });
}
