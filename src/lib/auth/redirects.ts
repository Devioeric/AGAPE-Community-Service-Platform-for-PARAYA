export const AUTH_CALLBACK_DEFAULT_PATH = "/" as const;

export const AUTH_CALLBACK_ALLOWED_PATHS = ["/reset-password"] as const;

export type AuthCallbackAllowedPath =
  (typeof AUTH_CALLBACK_ALLOWED_PATHS)[number];

export const PASSWORD_RECOVERY_MAX_AGE_MS = 60 * 60 * 1000;
const PASSWORD_RECOVERY_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Returns only a fixed, internal callback destination. Exact matching avoids
 * protocol-relative URLs, path traversal, encoded-host tricks, query-based
 * redirects, and other open-redirect variants.
 */
export function sanitizeAuthCallbackNext(value: unknown):
  | AuthCallbackAllowedPath
  | typeof AUTH_CALLBACK_DEFAULT_PATH {
  if (typeof value !== "string") return AUTH_CALLBACK_DEFAULT_PATH;

  return (AUTH_CALLBACK_ALLOWED_PATHS as readonly string[]).includes(value)
    ? (value as AuthCallbackAllowedPath)
    : AUTH_CALLBACK_DEFAULT_PATH;
}

export function isRecentPasswordRecovery(
  recoverySentAt: unknown,
  nowMs = Date.now()
): boolean {
  if (typeof recoverySentAt !== "string") return false;

  const sentAtMs = Date.parse(recoverySentAt);
  if (!Number.isFinite(sentAtMs)) return false;

  const ageMs = nowMs - sentAtMs;
  return (
    ageMs >= -PASSWORD_RECOVERY_CLOCK_SKEW_MS &&
    ageMs <= PASSWORD_RECOVERY_MAX_AGE_MS
  );
}
