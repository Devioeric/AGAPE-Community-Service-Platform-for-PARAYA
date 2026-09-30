import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isActiveAccount } from "@/lib/auth/account-status";
import { recordAudit, getRequestIp } from "@/lib/audit/log";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: profile, error } = await admin.from("users")
    .select("id, role, status, is_active, must_change_password")
    .eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Account state unavailable", code: "account_unavailable" }, { status: 503 });
  if (!profile || !isActiveAccount(profile)) return NextResponse.json({ error: "Account is inactive" }, { status: 403 });
  if (profile.must_change_password !== true) {
    return NextResponse.json(
      { error: "A first-login password change is not required for this account", code: "password_change_not_required" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 8 || password.length > 128) {
    return NextResponse.json(
      { error: "Password must be between 8 and 128 characters", code: "invalid_password" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const auditIntentRecorded = await recordAudit({
    user_id: user.id,
    user_email: user.email ?? null,
    action: "Initial password change requested",
    resource_type: "users",
    resource_id: user.id,
    level: "info",
    ip_address: getRequestIp(request),
    metadata: { must_change_password: true },
  });
  if (!auditIntentRecorded) {
    return NextResponse.json(
      { error: "The security audit trail is unavailable. The password was not changed.", code: "audit_unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Perform the password update here before clearing the application flag.
  // Otherwise an authenticated user could call this endpoint directly and
  // bypass the required first-login password change.
  const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, {
    password,
  });
  if (passwordError) {
    return NextResponse.json(
      { error: "Unable to update the password", code: "password_update_failed" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { error: updateError } = await admin.from("users")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (updateError) {
    return NextResponse.json(
      { error: "Unable to complete password setup", code: "account_update_failed" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  await recordAudit({
    user_id: user.id,
    user_email: user.email ?? null,
    action: "Initial password change completed",
    resource_type: "users",
    resource_id: user.id,
    level: "info",
    ip_address: getRequestIp(request),
    metadata: { must_change_password: false },
  });
  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
