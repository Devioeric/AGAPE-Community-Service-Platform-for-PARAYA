import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { generateOtp, OTP_TTL_MS } from "@/lib/attendance/otp";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string; actId: string }> };

// POST /api/programs/[id]/activities/[actId]/rotate-token
// Generates a new attendance OTP for the activity. Invalidates the previous.
// Officer/admin only.
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await authorizeCapability("attendance.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, actId } = await params;
  const otp       = generateOtp(6);
  const issuedAt  = new Date();
  const expiresAt = new Date(issuedAt.getTime() + OTP_TTL_MS);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("program_activities")
    .update({
      attendance_otp:            otp,
      attendance_otp_issued_at:  issuedAt.toISOString(),
      attendance_otp_expires_at: expiresAt.toISOString(),
      attendance_otp_issued_by:  auth.actor.id,
      updated_at:                issuedAt.toISOString(),
    })
    .eq("id", actId)
    .eq("program_id", id)
    .select("id, title, attendance_otp, attendance_otp_issued_at, attendance_otp_expires_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
