import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit, getRequestIp } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/dispatch";
import { BARANGAY_ROLES } from "@/lib/auth/roles";
import { isAdminAssignableLoginRole } from "@/lib/auth/provisioning";
import { NextResponse } from "next/server";

// Admin "Add User" — direct create with a temporary password.
// Differs from /api/admin/invite (which sends a Supabase invite email and lets
// the user set their own password). This route creates an active account
// immediately. Admin shares the temp password with the user securely out-of-band.

export async function POST(request: Request) {
  const auth = await authorizeCapability("admin.users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin    = createAdminClient();

  const body = await request.json().catch(() => ({}));
  const {
    email,
    full_name,
    password,
    role,
    barangay_id,
    department,
  } = body as {
    email?:        string;
    full_name?:    string;
    password?:     string;
    role?:         string;
    barangay_id?:  string | null;
    department?:   string | null;
  };

  // ── Validation ────────────────────────────────────────────────────────────
  if (!email || !full_name || !password || !role) {
    return NextResponse.json(
      { error: "Email, full name, password, and role are required." },
      { status: 400 }
    );
  }
  if (full_name.trim().length < 2) {
    return NextResponse.json({ error: "Full name must be at least 2 characters." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  if (!isAdminAssignableLoginRole(role)) {
    return NextResponse.json(
      { error: "Invalid or non-provisionable login role." },
      { status: 400 }
    );
  }

  const isBarangay  = (BARANGAY_ROLES as readonly string[]).includes(role);
  const isVolunteer = role === "volunteer";

  const auditIntentRecorded = await recordAudit({
    user_id:       auth.actor.id,
    user_email:    auth.actor.email,
    action:        "User creation requested",
    resource_type: "users",
    level:         "warning",
    ip_address:    getRequestIp(request),
    metadata: {
      email,
      role,
      barangay_id: isBarangay ? (barangay_id ?? null) : null,
      department:  isVolunteer ? (department?.trim() ?? null) : null,
    },
  });
  if (!auditIntentRecorded) {
    return NextResponse.json(
      { error: "The security audit trail is unavailable. No account was created.", code: "audit_unavailable" },
      { status: 503 }
    );
  }

  // ── Create auth user ──────────────────────────────────────────────────────
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name,
      role,
      barangay_id: isBarangay ? (barangay_id ?? null) : null,
    },
    app_metadata: { agape_role: role },
  });

  if (createErr || !created?.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "Failed to create user." },
      { status: 400 }
    );
  }

  // ── Upsert the application users row ──────────────────────────────────────
  const { error: dbError } = await admin.from("users").upsert({
    id:          created.user.id,
    email,
    full_name:   full_name.trim(),
    role,
    barangay_id: isBarangay ? (barangay_id ?? null) : null,
    status:      "active",
    is_active:   true,
    permissions: {},
  });

  if (dbError) {
    // Roll back the auth user so we don't leave an orphan
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // ── Volunteer profile row (non-fatal — table may have stricter NOT NULL constraints) ─
  if (isVolunteer && department?.trim()) {
    try {
      await admin.from("volunteers").insert({
        user_id:                 created.user.id,
        department:              department.trim(),
        student_id:              "",
        year_level:              0,
        total_hours:             0,
        consented_to_photo_use:  false,
      });
    } catch {
      // Swallow — the volunteer can complete their profile on first login.
    }
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  await recordAudit({
    user_id:       auth.actor.id,
    user_email:    auth.actor.email,
    action:        "User created (direct)",
    resource_type: "users",
    resource_id:   created.user.id,
    level:         "info",
    ip_address:    getRequestIp(request),
    metadata: {
      email, role,
      barangay_id: isBarangay ? (barangay_id ?? null) : null,
      department:  isVolunteer ? (department?.trim() ?? null) : null,
    },
  });

  // ── Welcome notification (in-app feed; first-login surface) ───────────────
  await notify({
    user_id:    created.user.id,
    title:      "Welcome to AGAPE",
    message:    "Your account has been created. Sign in with the temporary password your administrator shared, then update it from your profile.",
    type:       "announcement",
    action_url: "/",
  });

  return NextResponse.json({ success: true, user_id: created.user.id });
}
