import { getRequestIp, recordAudit } from "@/lib/audit/log";
import { isAdminAssignableLoginRole } from "@/lib/auth/provisioning";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const fullName =
    body && typeof body === "object" && !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).fullName === "string"
      ? ((body as Record<string, unknown>).fullName as string).trim()
      : "";

  if (fullName.length < 2 || fullName.length > 150) {
    return NextResponse.json(
      { error: "Full name must be between 2 and 150 characters." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const [authResult, profileResult] = await Promise.all([
    admin.auth.admin.getUserById(user.id),
    admin
      .from("users")
      .select("id, email, role, status, is_active")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const invitedUser = authResult.data.user;
  const profile = profileResult.data;

  if (authResult.error || profileResult.error) {
    return NextResponse.json(
      { error: "Invitation could not be verified. Please try again." },
      { status: 500 }
    );
  }

  if (!invitedUser?.invited_at) {
    return NextResponse.json(
      { error: "This account was not created through an administrator invitation." },
      { status: 403 }
    );
  }

  if (!profile || profile.status !== "pending" || profile.is_active !== false) {
    return NextResponse.json(
      { error: "This invitation has already been completed or is no longer active." },
      { status: 409 }
    );
  }

  if (!isAdminAssignableLoginRole(profile.role)) {
    return NextResponse.json(
      { error: "This account role is no longer provisioned. Contact an administrator." },
      { status: 403 }
    );
  }

  const auditIntentRecorded = await recordAudit({
    user_id: user.id,
    user_email: profile.email ?? user.email,
    action: "Invitation acceptance requested",
    resource_type: "users",
    resource_id: user.id,
    level: "warning",
    ip_address: getRequestIp(request),
    metadata: { role: profile.role },
  });
  if (!auditIntentRecorded) {
    return NextResponse.json(
      { error: "The security audit trail is unavailable. The account was not activated.", code: "audit_unavailable" },
      { status: 503 }
    );
  }

  // The status change is conditional so two tabs cannot activate the same
  // invitation twice. Ordinary clients no longer write status/is_active.
  const { data: activated, error: activationError } = await admin
    .from("users")
    .update({
      full_name: fullName,
      status: "active",
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .eq("status", "pending")
    .eq("is_active", false)
    .select("id, role")
    .maybeSingle();

  if (activationError) {
    return NextResponse.json(
      { error: "Account activation failed. Please try again." },
      { status: 500 }
    );
  }
  if (!activated) {
    return NextResponse.json(
      { error: "This invitation has already been completed or is no longer active." },
      { status: 409 }
    );
  }

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(user.id, {
    ban_duration: "none",
    user_metadata: {
      ...(invitedUser.user_metadata ?? {}),
      full_name: fullName,
      role: profile.role,
    },
    app_metadata: {
      ...(invitedUser.app_metadata ?? {}),
      agape_role: profile.role,
    },
  });

  if (authUpdateError) {
    // Keep application authorization fail-closed if Auth could not be brought
    // into the same state. The invite remains retryable with its current
    // authenticated session.
    await admin
      .from("users")
      .update({ status: "pending", is_active: false })
      .eq("id", user.id)
      .eq("status", "active");

    return NextResponse.json(
      { error: "Account activation failed. Please try again." },
      { status: 500 }
    );
  }

  await recordAudit({
    user_id: user.id,
    user_email: profile.email ?? user.email,
    action: "Invitation accepted",
    resource_type: "users",
    resource_id: user.id,
    level: "info",
    ip_address: getRequestIp(request),
    metadata: { role: profile.role },
  });

  return NextResponse.json({ success: true, role: profile.role });
}
