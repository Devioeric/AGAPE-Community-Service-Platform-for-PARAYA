import { createAdminClient } from "@/lib/supabase/admin";
import { INACTIVE_AUTH_BAN_DURATION } from "@/lib/auth/account-status";
import {
  parsePublicSignupBody,
  PUBLIC_SIGNUP_ROLE,
} from "@/lib/auth/public-signup";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parsePublicSignupBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { fullName, email, password } = parsed.value;
  const role = PUBLIC_SIGNUP_ROLE;
  const admin = createAdminClient();

  // The role is fixed by the server. Public callers can never provision a
  // privileged account, and a duplicate email never triggers a lookup,
  // password reset, metadata change, or profile upsert.
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ban_duration: INACTIVE_AUTH_BAN_DURATION,
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
    is_active: false,
    status:    "pending",
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

  return NextResponse.json({ success: true });
}
