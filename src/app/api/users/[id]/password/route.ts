import { createClient as createBrowserlessSupabaseClient } from "@supabase/supabase-js";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit, getRequestIp } from "@/lib/audit/log";
import { NextResponse } from "next/server";

type Body = {
  admin_password: string;
  mode:           "set" | "email";
  password?:      string;
};

// Verifies the admin's password by attempting to sign in on a throwaway,
// non-persisting Supabase client. This does NOT touch the admin's real
// session (no cookies/storage).
async function verifyAdminPassword(email: string, password: string): Promise<boolean> {
  const tempClient = createBrowserlessSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error } = await tempClient.auth.signInWithPassword({ email, password });
  return !error;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeCapability("admin.users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.actor.email) return NextResponse.json({ error: "Administrator email is unavailable" }, { status: 403 });

  const { id }     = await params;
  const body       = (await request.json()) as Body;

  if (!body.admin_password) {
    return NextResponse.json({ error: "Admin password is required" }, { status: 400 });
  }
  if (body.mode !== "set" && body.mode !== "email") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  if (body.mode === "set") {
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
  }

  // Re-verify admin password before performing the sensitive action
  const verified = await verifyAdminPassword(auth.actor.email, body.admin_password);
  if (!verified) {
    return NextResponse.json({ error: "Incorrect admin password" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  if (body.mode === "set") {
    const auditIntentRecorded = await recordAudit({
      user_id:       auth.actor.id,
      user_email:    auth.actor.email,
      action:        "Admin password change requested",
      resource_type: "users",
      resource_id:   id,
      level:         "warning",
      ip_address:    getRequestIp(request),
      metadata:      { mode: "set" },
    });
    if (!auditIntentRecorded) {
      return NextResponse.json(
        { error: "The security audit trail is unavailable. The password was not changed.", code: "audit_unavailable" },
        { status: 503 }
      );
    }

    const { error } = await adminClient.auth.admin.updateUserById(id, {
      password: body.password!,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await recordAudit({
      user_id:       auth.actor.id,
      user_email:    auth.actor.email,
      action:        "Password set by admin",
      resource_type: "users",
      resource_id:   id,
      level:         "warning",
      ip_address:    getRequestIp(request),
    });
    return NextResponse.json({ success: true, action: "password_set" });
  }

  // mode === "email": send a recovery email to the user's address
  const { data: target } = await adminClient
    .from("users").select("email").eq("id", id).single();
  if (!target?.email) {
    return NextResponse.json({ error: "User has no email on file" }, { status: 404 });
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  ).replace(/\/$/, "");
  const redirectTo = `${appUrl}/auth/callback?next=/reset-password`;
  const auditIntentRecorded = await recordAudit({
    user_id:       auth.actor.id,
    user_email:    auth.actor.email,
    action:        "Password reset email requested",
    resource_type: "users",
    resource_id:   id,
    level:         "info",
    ip_address:    getRequestIp(request),
    metadata:      { mode: "email", target_email: target.email },
  });
  if (!auditIntentRecorded) {
    return NextResponse.json(
      { error: "The security audit trail is unavailable. No reset email was sent.", code: "audit_unavailable" },
      { status: 503 }
    );
  }

  const { error: resetError } = await adminClient.auth.resetPasswordForEmail(
    target.email,
    { redirectTo }
  );
  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 500 });
  }

  await recordAudit({
    user_id:       auth.actor.id,
    user_email:    auth.actor.email,
    action:        "Password reset email sent",
    resource_type: "users",
    resource_id:   id,
    level:         "info",
    ip_address:    getRequestIp(request),
    metadata:      { target_email: target.email },
  });

  return NextResponse.json({ success: true, action: "email_sent", email: target.email });
}
