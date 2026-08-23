export const PUBLIC_SIGNUP_ROLE = "volunteer" as const;

export type PublicSignupInput = {
  fullName: string;
  email: string;
  password: string;
};

export type PublicSignupParseResult =
  | { ok: true; value: PublicSignupInput }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parses the public registration payload without depending on Next.js or
 * Supabase. The server, not the request body, remains the source of truth for
 * the only role that can self-register.
 */
export function parsePublicSignupBody(input: unknown): PublicSignupParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid registration request." };
  }

  const body = input as Record<string, unknown>;

  // Accept an explicit volunteer value for backwards-compatible clients, but
  // reject every attempt to select another role. New clients omit this field.
  if (
    Object.prototype.hasOwnProperty.call(body, "role") &&
    body.role !== undefined &&
    body.role !== PUBLIC_SIGNUP_ROLE
  ) {
    return {
      ok: false,
      error: "Public registration is available to student volunteers only.",
    };
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (fullName.length < 2 || fullName.length > 150) {
    return { ok: false, error: "Full name must be between 2 and 150 characters." };
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (password.length < 8 || password.length > 128) {
    return { ok: false, error: "Password must be between 8 and 128 characters." };
  }

  return { ok: true, value: { fullName, email, password } };
}
