import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isOtpValid } from "@/lib/attendance/otp";
import { notify } from "@/lib/notifications/dispatch";
import { getRequestIp } from "@/lib/audit/log";
import { NextResponse } from "next/server";

// POST /api/attendance/check-in
// Body: { otp: string, method?: "otp" | "qr" }
//
// Validates the OTP against an active program_activities row, then records an
// attendance entry tied to the calling volunteer. Only volunteers signed up
// for the parent program may check in.
export async function POST(request: Request) {
  const auth = await authorizeCapability("attendance.self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const userId = auth.actor.id;

  const body = await request.json() as { otp?: string; method?: "otp" | "qr" };
  const otp  = (body.otp ?? "").trim().toUpperCase();
  if (!otp || otp.length < 4) {
    return NextResponse.json({ error: "Enter the attendance code." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find the activity that holds this OTP. Use ilike (case-insensitive) match.
  const { data: activity } = await admin
    .from("program_activities")
    .select(`
      id, program_id, title, date,
      attendance_otp, attendance_otp_expires_at,
      programs ( id, title )
    `)
    .ilike("attendance_otp", otp)
    .order("attendance_otp_issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activity) {
    return NextResponse.json({ error: "Invalid attendance code." }, { status: 404 });
  }
  if (!isOtpValid(activity.attendance_otp, activity.attendance_otp_expires_at, otp)) {
    return NextResponse.json({ error: "This attendance code has expired. Ask the officer for a new one." }, { status: 410 });
  }

  // Verify the volunteer is signed up for the parent program (and not withdrawn).
  const { data: signup } = await admin
    .from("program_signups")
    .select("id, status")
    .eq("program_id", activity.program_id)
    .eq("volunteer_id", userId)
    .maybeSingle();
  if (!signup || signup.status === "withdrawn") {
    return NextResponse.json(
      { error: "You're not signed up for this program. Sign up from the Programs page first." },
      { status: 403 }
    );
  }

  // Record attendance (unique per activity_id + volunteer_id).
  const { error } = await admin
    .from("attendance")
    .insert({
      activity_id:  activity.id,
      volunteer_id: userId,
      method:       body.method === "qr" ? "qr" : "otp",
      ip_address:   getRequestIp(request),
    });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You've already checked in for this activity." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort: friendly in-app confirmation to the volunteer
  const programTitle = (activity.programs as { title?: string } | null)?.title ?? "Program";
  await notify({
    user_id:    userId,
    title:      "Attendance recorded",
    message:    `You're checked in for ${activity.title} (${programTitle}). Thank you for your service!`,
    type:       "success",
    action_url: "/volunteer/hours",
  });

  return NextResponse.json({
    success: true,
    activity: {
      id:    activity.id,
      title: activity.title,
      date:  activity.date,
    },
    program: activity.programs,
  });
}
