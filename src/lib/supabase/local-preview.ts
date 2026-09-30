/** This override is deliberately unavailable to hosted or other loopback projects. */
export function localPreviewAuthOptions() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:56321"
    && process.env.NEXT_PUBLIC_AGAPE_LOCAL_PREVIEW === "true"
    ? { cookieOptions: { name: "sb-agape-director-dev-auth" } } : {};
}
