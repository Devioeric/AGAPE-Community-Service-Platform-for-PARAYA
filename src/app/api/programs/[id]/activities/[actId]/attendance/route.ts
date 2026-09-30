import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProgramSignupUuid } from "@/lib/programs/signup-contract";
import { programOperationError } from "@/lib/programs/operation-error";
import { z } from "zod";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string; actId: string }> };
const headers = { "Cache-Control": "private, no-store" };

// GET /api/programs/[id]/activities/[actId]/attendance
// Returns the attendance roster for a single activity. Officer/admin only.
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authorizeCapability("attendance.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, actId } = await params;
  if (!isProgramSignupUuid(id) || !isProgramSignupUuid(actId)) return NextResponse.json({ error: "Invalid program or activity ID" }, { status: 400, headers });
  const admin = createAdminClient();

  const [{ data: activity }, { data: roster }] = await Promise.all([
    admin.from("program_activities")
      .select("id, title, date, attendance_otp, attendance_otp_issued_at, attendance_otp_expires_at, programs(id, title)")
      .eq("id", actId)
      .eq("program_id", id)
      .single(),
    admin.from("attendance")
      .select("id, checked_in_at, method, ip_address, notes, recorded_by, volunteer:users!volunteer_id(id, full_name, email)")
      .eq("activity_id", actId)
      .order("checked_in_at", { ascending: false }),
  ]);

  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });

  return NextResponse.json({
    data: {
      activity,
      roster: roster ?? [],
      otp_active: !!activity.attendance_otp
        && !!activity.attendance_otp_expires_at
        && new Date(activity.attendance_otp_expires_at).getTime() > Date.now(),
    },
  }, { headers });
}

// POST — manual attendance entry by an officer (e.g., paper sign-in retrofit).
// Body: { volunteer_id: string, notes?: string }
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("attendance.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, actId } = await params;
  const parsed = z.object({ volunteer_id: z.string().uuid(), notes: z.string().trim().max(500).optional().nullable() }).strict().safeParse(await request.json().catch(() => null));
  if (!isProgramSignupUuid(id) || !isProgramSignupUuid(actId)) return NextResponse.json({ error: "Invalid program or activity ID" }, { status: 400, headers });
  if (!parsed.success) return NextResponse.json({ error: "A valid volunteer is required" }, { status: 400 });

  const { error } = await auth.supabase.rpc("phase8_record_manual_attendance", {
    p_program_id: id, p_activity_id: actId,
    p_volunteer_id: parsed.data.volunteer_id, p_notes: parsed.data.notes || null,
  });

  if (error) {
    const failure = programOperationError(error, "attendance");
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers });
  }
  return NextResponse.json({ success: true }, { headers });
}
