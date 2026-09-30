import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit, getRequestIp } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/dispatch";
import { BARANGAY_ROLES } from "@/lib/auth/roles";
import { isAdminAssignableLoginRole } from "@/lib/auth/provisioning";
import {
  generateTemporaryPassword,
  validateTemporaryPassword,
} from "@/lib/auth/temporary-password";
import { NextResponse } from "next/server";

// Admin "Add User" — direct create with a temporary password.
// Differs from /api/admin/invite (which sends a Supabase invite email and lets
// the user set their own password). This route creates an active account
// immediately. Admin shares the temp password with the user securely out-of-band.

export async function POST(request: Request) {
  const auth = await authorizeCapability("admin.users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin    = createAdminClient();

  const parsedBody = await request.json().catch(() => ({}));
  const body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
    ? parsedBody as Record<string, unknown>
    : {};
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
  const hasPassword = Object.prototype.hasOwnProperty.call(body, "password");
  if (
    typeof email !== "string" ||
    typeof full_name !== "string" ||
    typeof role !== "string" ||
    (hasPassword && typeof password !== "string")
  ) {
    return NextResponse.json(
      { error: "Email, full name, and role are required." },
      { status: 400 }
    );
  }
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = full_name.trim();
  if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (normalizedName.length < 2 || normalizedName.length > 200) {
    return NextResponse.json({ error: "Full name must be between 2 and 200 characters." }, { status: 400 });
  }
  if (barangay_id !== undefined && barangay_id !== null && typeof barangay_id !== "string") {
    return NextResponse.json({ error: "Invalid Barangay assignment." }, { status: 400 });
  }
  if (department !== undefined && department !== null && typeof department !== "string") {
    return NextResponse.json({ error: "Invalid department value." }, { status: 400 });
  }
  const temporaryPassword = hasPassword ? password! : generateTemporaryPassword();
  const passwordError = validateTemporaryPassword(temporaryPassword);
  if (passwordError) {
    return NextResponse.json({ error: passwordError, code: "invalid_temporary_password" }, { status: 400 });
  }

  if (!isAdminAssignableLoginRole(role)) {
    return NextResponse.json(
      { error: "Invalid or non-provisionable login role." },
      { status: 400 }
    );
  }

  const isBarangay  = (BARANGAY_ROLES as readonly string[]).includes(role);
  const isVolunteer = role === "volunteer";
  if (role === "contributor") {
    const { count, error: contributorCountError } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "contributor")
      .eq("status", "active")
      .eq("is_active", true);
    if (contributorCountError) {
      return NextResponse.json({ error: "Unable to verify Contributor account capacity", code: "account_capacity_unavailable" }, { status: 503 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "Only one active Contributor account is allowed", code: "active_contributor_exists" }, { status: 409 });
    }
  }
  if (isBarangay && !barangay_id) {
    return NextResponse.json(
      { error: "A Barangay Secretary must be assigned to a barangay." },
      { status: 400 },
    );
  }

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
    email: normalizedEmail,
    password: temporaryPassword,
    email_confirm: true,
    // Direct administrator provisioning is already approved. Do not inherit
    // the pending/banned state used by public self-registration.
    ban_duration: "none",
    user_metadata: {
      full_name: normalizedName,
      role,
      barangay_id: isBarangay ? (barangay_id ?? null) : null,
    },
    app_metadata: { agape_role: role },
  });

  if (createErr || !created?.user) {
    return NextResponse.json(
      { error: "Unable to create the authentication identity.", code: "auth_identity_creation_failed" },
      { status: createErr?.status && createErr.status >= 400 && createErr.status < 500 ? createErr.status : 503 }
    );
  }

  // ── Upsert the application users row ──────────────────────────────────────
  const { error: dbError } = await admin.from("users").upsert({
    id:          created.user.id,
    email: normalizedEmail,
    full_name:   normalizedName,
    role,
    barangay_id: isBarangay ? (barangay_id ?? null) : null,
    status:      "active",
    is_active:   true,
    must_change_password: true,
    permissions: {},
  });

  if (dbError) {
    // Roll back the auth user so we don't leave an orphan
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: "Unable to create the application account", code: "profile_creation_failed" }, { status: 503 });
  }

  // Keep Auth and the application account in the same approved state. This
  // explicit update protects local synthetic Auth implementations that apply a
  // default ban unless the duration is set after creation.
  const { error: authStateError } = await admin.auth.admin.updateUserById(created.user.id, {
    ban_duration: "none",
    app_metadata: { agape_role: role },
  });
  if (authStateError) {
    await admin.from("users").delete().eq("id", created.user.id);
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return NextResponse.json({ error: "The account could not be activated in the authentication provider.", code: "auth_activation_failed" }, { status: 503 });
  }

  const { data: verifiedProfile, error: verifyError } = await admin
    .from("users")
    .select("status, is_active, role")
    .eq("id", created.user.id)
    .maybeSingle();
  if (verifyError || !verifiedProfile || verifiedProfile.status !== "active" || verifiedProfile.is_active !== true || verifiedProfile.role !== role) {
    await admin.from("users").delete().eq("id", created.user.id);
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return NextResponse.json({ error: "The account profile could not be verified as active.", code: "profile_activation_failed" }, { status: 503 });
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
      email: normalizedEmail, role,
      barangay_id: isBarangay ? (barangay_id ?? null) : null,
      department:  isVolunteer ? (department?.trim() ?? null) : null,
    },
  });

  // ── Welcome notification (in-app feed; first-login surface) ───────────────
  await notify({
    user_id:    created.user.id,
    title:      "Welcome to AGAPE",
    message:    "Your account has been created. Sign in with the temporary password your administrator shared, then complete the required password change.",
    type:       "announcement",
    action_url: "/",
  });

  // The plaintext credential is never persisted by the application and is
  // returned only in this successful creation response. It cannot be retrieved
  // later from User Management or the Auth provider.
  return NextResponse.json(
    {
      success: true,
      user_id: created.user.id,
      temporary_password: temporaryPassword,
      must_change_password: true,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
