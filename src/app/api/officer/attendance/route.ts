import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";

// GET /api/officer/attendance
// Returns activities the officer can run attendance for, sorted by date
// (closest to today first). Includes per-activity OTP status + check-in count.
export async function GET() {
  const auth = await authorizeCapability("attendance.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();

  // Activities from the last 14 days and the next 60 days
  const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const to   = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

  const { data: activities, error } = await admin
    .from("program_activities")
    .select(`
      id, title, date, status,
      attendance_otp, attendance_otp_issued_at, attendance_otp_expires_at,
      programs ( id, title, status, barangays(name) ),
      attendance ( count )
    `)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const enriched = (activities ?? []).map((a) => {
    const expiresAt = a.attendance_otp_expires_at ? new Date(a.attendance_otp_expires_at).getTime() : 0;
    return {
      id:                a.id,
      title:             a.title,
      date:              a.date,
      status:            a.status,
      program:           a.programs,
      attendance_otp:    a.attendance_otp,
      otp_issued_at:     a.attendance_otp_issued_at,
      otp_expires_at:    a.attendance_otp_expires_at,
      otp_active:        !!a.attendance_otp && expiresAt > now,
      check_in_count:    Array.isArray(a.attendance) ? (a.attendance[0]?.count ?? 0) : 0,
    };
  });

  return NextResponse.json({ data: enriched });
}
