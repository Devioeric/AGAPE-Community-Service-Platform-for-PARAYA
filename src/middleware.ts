import { createServerClient } from "@supabase/ssr";
import { localPreviewAuthOptions } from "@/lib/supabase/local-preview";
import { NextResponse, type NextRequest } from "next/server";
import { isActiveAccount } from "@/lib/auth/account-status";
import { classifyApiAccess } from "@/lib/auth/request-access";
import { isRecentPasswordRecovery } from "@/lib/auth/redirects";
import { canAccessPage } from "@/lib/auth/capabilities";
import { isActiveLoginRole, isRetiredBarangayRole, isRoleEnabled, ROLE_HOME } from "@/lib/auth/roles";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth/callback",
  "/accept-invite",
  "/reset-password",
  "/join",
  "/verify/finance",
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
  // Use the original request origin, not NextURL's normalized loopback host.
  // Destinations remain internal constants; never trust forwarded-host input.
  const url = new URL(request.url);
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
  const started = performance.now();
  const response = await authorizeRequest(request);
  response.headers.set("X-AGAPE-Middleware-Ms", (performance.now() - started).toFixed(1));
  return response;
}

async function authorizeRequest(request: NextRequest) {
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
      ...localPreviewAuthOptions(),
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

  // Finance integrity verification is deliberately public. It exposes only
  // the stored commitment and anchoring receipt, never a budget, liquidation,
  // document, contact, or authenticated application profile.
  if (pathname === "/verify/finance" || pathname.startsWith("/verify/finance/")) {
    return supabaseResponse;
  }

  async function loadAccount() {
    // Independent fresh checks; no cross-request authorization cache.
    const [{ data: profile }, { data: retired }] = await Promise.all([
      supabase.from("users").select("role, full_name, permissions, status, is_active, must_change_password").eq("id", user!.id).single(),
      supabase.rpc("phase0_current_account_has_retired_barangay_role"),
    ]);
    return { profile, hasRetiredBarangayRole: retired === true };
  }

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

    const { profile, hasRetiredBarangayRole } = await loadAccount();

    if (hasRetiredBarangayRole || isRetiredBarangayRole(profile?.role)) {
      await supabase.auth.signOut();
      return jsonErrorWithCookies(supabaseResponse, 403, "This barangay role has been retired; contact the administrator");
    }

    if (!isActiveAccount(profile) || !isActiveLoginRole(profile?.role) || !ROLE_HOME[profile.role] || !isRoleEnabled(profile?.role)) {
      await supabase.auth.signOut();
      return jsonErrorWithCookies(supabaseResponse, 403, profile?.role === "contributor" ? "Contributor access is disabled" : "Account is inactive");
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

    const { profile, hasRetiredBarangayRole } = await loadAccount();

    const mayResetPassword =
      pathname.startsWith("/reset-password") &&
      isActiveAccount(profile) &&
      (isRecentPasswordRecovery(user.recovery_sent_at) || profile?.must_change_password === true);

    if (mayResetPassword) return supabaseResponse;

    if (hasRetiredBarangayRole || isRetiredBarangayRole(profile?.role)) {
      await supabase.auth.signOut();
      return redirectWithCookies(request, supabaseResponse, "/login", "role_retired");
    }

    if (!isActiveAccount(profile) || !isActiveLoginRole(profile?.role) || !ROLE_HOME[profile.role]) {
      await supabase.auth.signOut();
      return redirectWithCookies(
        request,
        supabaseResponse,
        "/login",
        "account_inactive"
      );
    }

    // Password recovery/reset remains available so an operator can repair an
    // account while the Contributor rollout is disabled.  No protected route
    // or API is reachable until the rollout flag is explicitly enabled.
    if (!isRoleEnabled(profile?.role)) {
      await supabase.auth.signOut();
      return redirectWithCookies(request, supabaseResponse, "/login", "contributor_disabled");
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
    const { profile, hasRetiredBarangayRole } = await loadAccount();

    if (hasRetiredBarangayRole || isRetiredBarangayRole(profile?.role)) {
      await supabase.auth.signOut();
      return redirectWithCookies(request, supabaseResponse, "/login", "role_retired");
    }

    if (!isActiveAccount(profile) || !isActiveLoginRole(profile?.role) || !ROLE_HOME[profile.role]) {
      await supabase.auth.signOut();
      return redirectWithCookies(
        request,
        supabaseResponse,
        "/login",
        "account_inactive"
      );
    }

    if (!isRoleEnabled(profile?.role)) {
      await supabase.auth.signOut();
      return redirectWithCookies(request, supabaseResponse, "/login", "contributor_disabled");
    }

    if (profile.must_change_password === true && pathname !== "/reset-password") {
      return redirectWithCookies(request, supabaseResponse, "/reset-password", "password_change_required");
    }

    const role = profile.role;
    const home = ROLE_HOME[role];

    // Compatibility redirect for bookmarks to the retired Captain queue.
    if (role === "barangay_secretary" && pathname.startsWith("/barangay/approvals")) {
      const destination = canAccessPage(role, profile.permissions, "/barangay/submit-needs")
        ? "/barangay/submit-needs"
        : home;
      return redirectWithCookies(request, supabaseResponse, destination);
    }

    const allowedPrefix = ROLE_HOME[role];
    const isAllowed = Boolean(allowedPrefix) &&
      (pathname === allowedPrefix || pathname.startsWith(`${allowedPrefix}/`));

    if (!isAllowed && pathname !== "/") {
      return redirectWithCookies(request, supabaseResponse, home);
    }

    if (isAllowed && !canAccessPage(role, profile.permissions, pathname)) {
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
