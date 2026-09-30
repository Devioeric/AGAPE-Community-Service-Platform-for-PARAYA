/** @type {import('next').NextConfig} */
const ownedLoopback = process.env.AGAPE_DB_TEST_ISOLATED === "true" &&
  ["http://127.0.0.1:55321", "http://127.0.0.1:56321"].includes(process.env.NEXT_PUBLIC_SUPABASE_URL);
const nextConfig = {
  // Next 14 otherwise normalizes 127.0.0.1 redirects to localhost, losing
  // host-scoped auth cookies. Hosted URL normalization remains unchanged.
  skipMiddlewareUrlNormalize: ownedLoopback,
};

export default nextConfig;
