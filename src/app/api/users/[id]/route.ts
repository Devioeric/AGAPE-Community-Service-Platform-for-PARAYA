import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit, getRequestIp } from "@/lib/audit/log";
import {
  INACTIVE_AUTH_BAN_DURATION,
  isActiveAccount,
} from "@/lib/auth/account-status";
import { isActiveLoginRole, isRetiredBarangayRole } from "@/lib/auth/roles";
import { isAdminAssignableLoginRole } from "@/lib/auth/provisioning";
import { normalizeDenyOnlyOverrides } from "@/lib/auth/capabilities";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeCapability("admin.users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json().catch(() => null) as {
    status?:      string;
    role?:        string;
    full_name?:   string;
    barangay_id?: string | null;
    permissions?: Record<string, boolean>;
  } | null;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const allowed = ["active", "pending", "suspended"];
  if (
    body.status !== undefined &&
    (typeof body.status !== "string" || !allowed.includes(body.status))
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (body.role !== undefined && !isAdminAssignableLoginRole(body.role)) {
    return NextResponse.json(
      { error: "Invalid or non-provisionable login role" },
      { status: 400 }
    );
  }

  if (
    body.full_name !== undefined &&
    (typeof body.full_name !== "string" ||
      body.full_name.trim().length < 2 ||
      body.full_name.trim().length > 150)
  ) {
    return NextResponse.json(
      { error: "Full name must be between 2 and 150 characters" },
      { status: 400 }
    );
  }

  const adminDb = createAdminClient();
  const { data: target, error: targetError } = await adminDb
    .from("users")
    .select("id, role, status, is_active, barangay_id, must_change_password")
    .eq("id", id)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: "Unable to load target account" }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const isHistoricalTarget = !isActiveLoginRole(target.role);
  const hasMutation = Object.keys(body).length > 0;
  if (isRetiredBarangayRole(target.role) && hasMutation) {
    return NextResponse.json(
      { error: "Retired barangay accounts cannot be reactivated or converted" },
      { status: 400 },
    );
  }
  if (isHistoricalTarget && hasMutation) {
    return NextResponse.json(
      { error: "Historical accounts cannot be reactivated or converted; create an approved login explicitly" },
      { status: 400 },
    );
  }

  const resultingRole = body.role ?? target.role;
  const resultingStatus = body.status ?? target.status;
  const resultingBarangayId = body.barangay_id !== undefined ? body.barangay_id : target.barangay_id;
  if (resultingRole === "contributor" && resultingStatus === "active") {
    const { count: activeContributorCount, error: contributorCountError } = await adminDb
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "contributor")
      .eq("status", "active")
      .eq("is_active", true)
      .neq("id", id);
    if (contributorCountError) {
      return NextResponse.json({ error: "Unable to verify Contributor account capacity", code: "account_capacity_unavailable" }, { status: 503 });
    }
    if ((activeContributorCount ?? 0) > 0) {
      return NextResponse.json({ error: "Only one active Contributor account is allowed", code: "active_contributor_exists" }, { status: 409 });
    }
  }
  if (resultingRole === "barangay_secretary" && resultingStatus === "active" && !resultingBarangayId) {
    return NextResponse.json(
      { error: "An active Barangay Secretary must be assigned to a barangay" },
      { status: 400 },
    );
  }

  let normalizedPermissions: Record<string, false> | undefined;
  if (body.permissions !== undefined) {
    try {
      normalizedPermissions = normalizeDenyOnlyOverrides(body.role ?? target.role, body.permissions);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid permissions" },
        { status: 400 },
      );
    }
  }

  // The sole System Administrator cannot be demoted or deactivated through
  // the ordinary user editor. Institutional recovery must use a separately
  // controlled process.
  if (
    target.role === "admin" &&
    (body.role !== undefined ||
      (body.status !== undefined && body.status !== "active"))
  ) {
    return NextResponse.json(
      { error: "The System Administrator role and active status are protected" },
      { status: 400 }
    );
  }

  if (target.role === "admin" && target.status === "active" && (resultingRole !== "admin" || resultingStatus !== "active")) {
    const { count: adminCount } = await adminDb.from("users").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active").eq("is_active", true);
    if ((adminCount ?? 0) <= 1) return NextResponse.json({ error: "The final active administrator cannot be removed", code: "last_admin_protected" }, { status: 409 });
  }

  const isStatusChange = body.status !== undefined;
  const isRoleChange   = body.role   !== undefined;
  const level = isStatusChange || isRoleChange ? "warning" : "info";
  const action =
    isStatusChange ? `User status set to "${body.status}"` :
    isRoleChange   ? `User role set to "${body.role}"`   :
    "User profile updated";
  const requestedChanges = Object.fromEntries(
    Object.entries({
      status: body.status,
      role: body.role,
      full_name: body.full_name?.trim(),
      barangay_id: body.barangay_id,
      permissions: normalizedPermissions,
    }).filter(([, value]) => value !== undefined)
  );

  const auditIntentRecorded = await recordAudit({
    user_id:       auth.actor.id,
    user_email:    auth.actor.email,
    action:        `${action} requested`,
    resource_type: "users",
    resource_id:   id,
    level,
    ip_address:    getRequestIp(request),
    metadata: {
      previous_role: target.role,
      previous_status: target.status,
      requested_changes: requestedChanges,
    },
  });
  if (!auditIntentRecorded) {
    return NextResponse.json(
      { error: "The security audit trail is unavailable. No account changes were applied.", code: "audit_unavailable" },
      { status: 503 }
    );
  }

  if (body.status !== undefined) {
    const banDuration =
      body.status === "active" ? "none" : INACTIVE_AUTH_BAN_DURATION;
    const { error: authStatusError } = await adminDb.auth.admin.updateUserById(id, {
      ban_duration: banDuration,
    });

    if (authStatusError) {
      return NextResponse.json(
        { error: "Unable to update account authentication status", code: "auth_status_unavailable" },
        { status: 503 }
      );
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status      !== undefined) { updates.status      = body.status; updates.is_active = body.status === "active"; }
  if (body.role        !== undefined) updates.role        = body.role;
  if (body.full_name   !== undefined) updates.full_name   = body.full_name.trim();
  if (body.barangay_id !== undefined) updates.barangay_id = body.barangay_id;
  if (normalizedPermissions !== undefined) updates.permissions = normalizedPermissions;

  const { error } = await adminDb.from("users").update(updates).eq("id", id);
  if (error) {
    if (body.status !== undefined) {
      const previousBanDuration = isActiveAccount(target)
        ? "none"
        : INACTIVE_AUTH_BAN_DURATION;
      await adminDb.auth.admin
        .updateUserById(id, { ban_duration: previousBanDuration })
        .catch(() => undefined);
    }
    return NextResponse.json({ error: "Unable to update the account profile", code: "profile_update_unavailable" }, { status: 503 });
  }

  // Mirror full_name into auth user_metadata so it stays in sync
  if (body.full_name !== undefined) {
    await adminDb.auth.admin.updateUserById(id, {
      user_metadata: { full_name: body.full_name.trim() },
    });
  }

  if (body.role !== undefined) {
    await adminDb.auth.admin.updateUserById(id, {
      app_metadata: { agape_role: body.role },
    });
  }

  if (body.role !== undefined && body.role !== target.role) {
    await adminDb.from("role_history").insert({
      user_id: id,
      previous_role: target.role,
      new_role: body.role,
      change_reason: "Administrator role update",
      actor_id: auth.actor.id,
      source_status: target.status,
      target_status: resultingStatus,
    });
  }

  await recordAudit({
    user_id:       auth.actor.id,
    user_email:    auth.actor.email,
    action,
    resource_type: "users",
    resource_id:   id,
    level,
    ip_address:    getRequestIp(request),
    metadata:      Object.fromEntries(Object.entries(updates).filter(([k]) => k !== "updated_at")),
  });

  return NextResponse.json({ success: true });
}
