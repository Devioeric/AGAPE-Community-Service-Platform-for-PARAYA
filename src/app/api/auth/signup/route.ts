import { createAdminClient } from "@/lib/supabase/admin";
import { INACTIVE_AUTH_BAN_DURATION } from "@/lib/auth/account-status";
import {
  parsePublicSignupBody,
  PUBLIC_SIGNUP_ROLE,
} from "@/lib/auth/public-signup";
import { NextResponse } from "next/server";
import { phase4InvitationsEnabled } from "@/lib/volunteers/phase4-contracts";
import { hashInvitationEmail, hashInvitationToken } from "@/lib/volunteers/phase4-server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parsePublicSignupBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { fullName, email, password, programInvitationToken } = parsed.value;
  const role = PUBLIC_SIGNUP_ROLE;
  const admin = createAdminClient();
  const invited = Boolean(programInvitationToken);

  if (invited) {
    if (!phase4InvitationsEnabled()) {
      return NextResponse.json({ error: "This program invitation is not available." }, { status: 404 });
    }
    const { data: invitation } = await admin.rpc("phase4_resolve_invitation", {
      p_token_hash: hashInvitationToken(programInvitationToken!),
    });
    if (!invitation || invitation.available !== true) {
      return NextResponse.json({ error: "This program invitation is invalid or expired." }, { status: 400 });
    }
    if (invitation.requiresInstitutionalEmail === true &&
        email.split("@")[1] !== invitation.allowedEmailDomain) {
      return NextResponse.json({ error: "Use the institutional email required by this invitation." }, { status: 400 });
    }
  }

  // The role is fixed by the server. Public callers can never provision a
  // privileged account, and a duplicate email never triggers a lookup,
  // password reset, metadata change, or profile upsert.
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(invited ? {} : { ban_duration: INACTIVE_AUTH_BAN_DURATION }),
    user_metadata: { full_name: fullName, role },
    app_metadata: { agape_role: role },
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      {
        error:
          "Registration could not be completed. If you already have an account, sign in or reset your password.",
      },
      { status: 400 }
    );
  }

  const { error: dbError } = await admin.from("users").insert({
    id:        authData.user.id,
    email,
    full_name: fullName,
    role,
    is_active: invited,
    status:    invited ? "active" : "pending",
  });

  if (dbError) {
    // This ID was created by this request, so removing it is a bounded rollback
    // rather than an operation against a pre-existing account.
    await admin.auth.admin.deleteUser(authData.user.id).catch(() => undefined);
    return NextResponse.json(
      { error: "Registration could not be completed. Please try again." },
      { status: 500 }
    );
  }

  if (invited) {
    const { error: volunteerError } = await admin.from("volunteers").insert({
      user_id: authData.user.id,
      status: "active",
    });
    const { data: joinResult, error: joinError } = volunteerError
      ? { data: null, error: volunteerError }
      : await admin.rpc("phase4_consume_invitation_for_user", {
          p_token_hash: hashInvitationToken(programInvitationToken!),
          p_user_id: authData.user.id,
          p_email_hash: hashInvitationEmail(email),
        });
    if (joinError) {
      await admin.from("users").delete().eq("id", authData.user.id);
      await admin.auth.admin.deleteUser(authData.user.id).catch(() => undefined);
      return NextResponse.json({ error: "Registration could not join this program. Please try again." }, { status: 409 });
    }
    return NextResponse.json({ success: true, invitation: joinResult });
  }

  return NextResponse.json({ success: true });
}
