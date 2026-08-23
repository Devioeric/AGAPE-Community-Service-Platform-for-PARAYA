import {
  AUTH_CALLBACK_DEFAULT_PATH,
  sanitizeAuthCallbackNext,
} from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeAuthCallbackNext(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // Supabase can also deliver a recovery session in the URL fragment when the
  // email was initiated outside the PKCE browser that owns a code verifier.
  // Fragments are not sent to the server, but browsers carry them across this
  // same-origin redirect so the reset page's Supabase client can consume it.
  if (!code && next !== AUTH_CALLBACK_DEFAULT_PATH) {
    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  const retryUrl = new URL("/forgot-password", requestUrl.origin);
  retryUrl.searchParams.set("reason", "invalid_recovery_link");
  return NextResponse.redirect(retryUrl);
}
