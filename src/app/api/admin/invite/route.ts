import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit, getRequestIp } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/dispatch";
import { isAdminAssignableLoginRole } from "@/lib/auth/provisioning";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authorizeCapability("admin.users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin    = createAdminClient();

  const body = await request.json().catch(() => null);
  const email =
    body && typeof body === "object" && !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).email === "string"
      ? ((body as Record<string, unknown>).email as string).trim().toLowerCase()
      : "";
  const role =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).role
      : undefined;
  const rawBarangayId =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).barangay_id
      : null;
  const barangay_id =
    typeof rawBarangayId === "string" && rawBarangayId.trim()
      ? rawBarangayId.trim()
      : null;

  if (!email || !role) {
    return NextResponse.json({ error: "Email and role are required" }, { status: 400 });
  }

  if (!isAdminAssignableLoginRole(role)) {
    return NextResponse.json(
      { error: "Invalid or non-provisionable login role" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const redirectTo = `${appUrl.replace(/\/$/, "")}/accept-invite`;

  const auditIntentRecorded = await recordAudit({
    user_id:       auth.actor.id,
    user_email:    auth.actor.email,
    action:        "User invitation requested",
    resource_type: "users",
    level:         "warning",
    ip_address:    getRequestIp(request),
    metadata:      { email, role, barangay_id: barangay_id ?? null },
  });
  if (!auditIntentRecorded) {
    return NextResponse.json(
      { error: "The security audit trail is unavailable. No invitation was sent.", code: "audit_unavailable" },
      { status: 503 }
    );
  }

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { role, barangay_id: barangay_id ?? null },
  });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  // Pre-seed the users table row so the invited user has role + barangay set
  const { error: dbError } = await admin.from("users").insert({
    id:          inviteData.user.id,
    email,
    full_name:   "Invited User",
    role,
    barangay_id: barangay_id ?? null,
    status:      "pending",
    is_active:   false,
    permissions: {},
  });

  if (dbError) {
    // The Auth identity was created by this invitation request. Revoke it so a
    // profile-write failure does not leave an ungoverned account or live link.
    await admin.auth.admin.deleteUser(inviteData.user.id).catch(() => undefined);
    return NextResponse.json(
      { error: "Invitation could not be completed. Please try again." },
      { status: 500 }
    );
  }

  await recordAudit({
    user_id:       auth.actor.id,
    user_email:    auth.actor.email,
    action:        "User invited",
    resource_type: "users",
    resource_id:   inviteData.user.id,
    level:         "info",
    ip_address:    getRequestIp(request),
    metadata:      { email, role, barangay_id: barangay_id ?? null },
  });

  // Welcome notification — sits in the user's in-app feed for when they sign in
  // for the first time. Email goes through Supabase's invite system (already
  // sent above), so we skip email here to avoid duplicates.
  await notify({
    user_id:    inviteData.user.id,
    title:      "Welcome to AGAPE",
    message:    "Your account has been set up. Complete your profile and explore the modules in the sidebar.",
    type:       "announcement",
    action_url: "/accept-invite",
  });

  return NextResponse.json({ success: true });
}
