import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { z } from "zod";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string; actId: string }> };

// GET /api/programs/[id]/activities/[actId]/attendance
// Returns the attendance roster for a single activity. Officer/admin only.
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authorizeCapability("attendance.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, actId } = await params;
  const admin = createAdminClient();

  const [{ data: activity }, { data: roster }] = await Promise.all([
    admin.from("program_activities")
      .select("id, title, date, attendance_otp, attendance_otp_issued_at, attendance_otp_expires_at, programs(id, title)")
      .eq("id", actId)
      .eq("program_id", id)
      .single(),
    admin.from("attendance")
      .select("id, checked_in_at, method, ip_address, volunteer:users!volunteer_id(id, full_name, email)")
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
  });
}

// POST — manual attendance entry by an officer (e.g., paper sign-in retrofit).
// Body: { volunteer_id: string, notes?: string }
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("attendance.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, actId } = await params;
  const parsed = z.object({ volunteer_id: z.string().uuid(), notes: z.string().trim().max(500).optional().nullable() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid volunteer is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: activity } = await admin.from("program_activities").select("id").eq("id", actId).eq("program_id", id).maybeSingle();
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  const { error } = await admin
    .from("attendance")
    .insert({
      activity_id:  actId,
      volunteer_id: parsed.data.volunteer_id,
      method:       "manual",
      notes:        parsed.data.notes || null,
    });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already recorded for this activity" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
