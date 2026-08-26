import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isActiveAccount } from "@/lib/auth/account-status";
import { classifyApiAccess } from "@/lib/auth/request-access";
import { isRecentPasswordRecovery } from "@/lib/auth/redirects";
import { ROLE_HOME } from "@/lib/auth/roles";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth/callback",
  "/accept-invite",
  "/reset-password",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function redirectWithCookies(
  request: NextRequest,
  source: NextResponse,
  pathname: string,
  reason?: string
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (reason) url.searchParams.set("reason", reason);

  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

function jsonErrorWithCookies(
  source: NextResponse,
  status: 401 | 403,
  error: string
) {
  const response = NextResponse.json({ error }, { status });
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export async function middleware(request: NextRequest) {
  // Augment request headers so server components can read user profile
  // without making their own Supabase calls.
  const requestHeaders = new Headers(request.headers);
  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = isPublicRoute(pathname);
  const apiAccess = classifyApiAccess(pathname);

  // API routes retain their own fine-grained RBAC, but this central gate makes
  // an active application profile a prerequisite. The only exceptions are
  // public volunteer registration, independently authenticated cron jobs, and
  // the single invite-completion action for a pending invited identity.
  if (apiAccess !== "not_api") {
    if (apiAccess === "public") return supabaseResponse;

    if (!user) {
      return jsonErrorWithCookies(supabaseResponse, 401, "Unauthorized");
    }

    if (apiAccess === "invite_completion") {
      const { data: mayCompleteInvite, error } = await supabase.rpc(
        "phase0_current_invite_can_complete"
      );
      return !error && mayCompleteInvite === true
        ? supabaseResponse
        : jsonErrorWithCookies(supabaseResponse, 403, "Forbidden");
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role, status, is_active")
      .eq("id", user.id)
      .single();

    if (!isActiveAccount(profile) || !profile?.role || !ROLE_HOME[profile.role]) {
      await supabase.auth.signOut();
      return jsonErrorWithCookies(supabaseResponse, 403, "Account is inactive");
    }

    return supabaseResponse;
  }

  // Unauthenticated users can only access exact public routes (or their
  // descendants), rather than arbitrary paths that share the same prefix.
  if (!user && !isPublic) {
    return redirectWithCookies(request, supabaseResponse, "/login");
  }

  // Only an administrator-created, still-pending invite can use the account
  // completion page. Every other authenticated public-route request requires
  // a fully active application profile.
  if (user && isPublic) {
    // The callback must be allowed to exchange a new PKCE code even when the
    // browser already has a valid session for the same account.
    if (pathname.startsWith("/auth/callback")) return supabaseResponse;

    const isInviteCompletion = pathname.startsWith("/accept-invite");
    if (isInviteCompletion) {
      const { data: mayCompleteInvite, error } = await supabase.rpc(
        "phase0_current_invite_can_complete"
      );
      if (!error && mayCompleteInvite === true) return supabaseResponse;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role, status, is_active")
      .eq("id", user.id)
      .single();

    const mayResetPassword =
      pathname.startsWith("/reset-password") &&
      isActiveAccount(profile) &&
      isRecentPasswordRecovery(user.recovery_sent_at);

    if (mayResetPassword) return supabaseResponse;

    if (!isActiveAccount(profile) || !profile?.role || !ROLE_HOME[profile.role]) {
      await supabase.auth.signOut();
      return redirectWithCookies(
        request,
        supabaseResponse,
        "/login",
        "account_inactive"
      );
    }

    return redirectWithCookies(
      request,
      supabaseResponse,
      ROLE_HOME[profile.role]
    );
  }

  // Authenticated users: enforce both application-account state and the
  // role-specific dashboard boundary, then inject the trusted profile headers.
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("users")
      .select("role, full_name, permissions, status, is_active")
      .eq("id", user.id)
      .single();

    if (!isActiveAccount(profile) || !profile?.role || !ROLE_HOME[profile.role]) {
      await supabase.auth.signOut();
      return redirectWithCookies(
        request,
        supabaseResponse,
        "/login",
        "account_inactive"
      );
    }

    const role = profile.role;
    const home = ROLE_HOME[role];

    const allowedPrefix = ROLE_HOME[role];
    const isAllowed = Boolean(allowedPrefix) &&
      (pathname === allowedPrefix || pathname.startsWith(`${allowedPrefix}/`));

    if (!isAllowed && pathname !== "/") {
      return redirectWithCookies(request, supabaseResponse, home);
    }

    if (pathname === "/") {
      return redirectWithCookies(request, supabaseResponse, home);
    }

    requestHeaders.set("x-user-id", user.id);
    requestHeaders.set("x-user-email", user.email ?? "");
    requestHeaders.set("x-user-role", role);
    requestHeaders.set(
      "x-user-name",
      profile.full_name ?? user.email ?? "User"
    );
    requestHeaders.set(
      "x-user-permissions",
      JSON.stringify(profile.permissions ?? {})
    );
    requestHeaders.set("x-pathname", pathname);

    const augmented = NextResponse.next({
      request: { headers: requestHeaders },
    });
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      augmented.cookies.set(cookie);
    });
    return augmented;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
