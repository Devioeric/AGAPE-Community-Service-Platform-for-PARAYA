import { authorizeCapability } from "@/lib/auth/authorize";
import { parseAttendanceCheckIn } from "@/lib/attendance/check-in-contract";
import { notify } from "@/lib/notifications/dispatch";
import { getRequestIp } from "@/lib/audit/log";
import { programOperationError } from "@/lib/programs/operation-error";
import { NextResponse } from "next/server";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const auth = await authorizeCapability("attendance.self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const parsed = parseAttendanceCheckIn(await request.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: "Enter a valid six-character attendance code." }, { status: 400, headers });
  // Authenticated database transaction verifies the current code, activity,
  // active volunteer and approved assignment before recording attendance.
  const { data, error } = await auth.supabase.rpc("phase8_check_in_attendance", {
    p_otp: parsed.otp, p_method: parsed.method, p_ip_address: getRequestIp(request),
  });
  if (error) {
    const failure = programOperationError(error, "attendance");
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers });
  }
  await notify({
    user_id: auth.actor.id, title: "Attendance recorded",
    message: `You're checked in for ${data.activity.title} (${data.program.title}). Thank you for your service!`,
    type: "success", action_url: "/volunteer/hours",
  }).catch(() => undefined);
  return NextResponse.json({ success: true, activity: data.activity, program: data.program }, { headers });
}
