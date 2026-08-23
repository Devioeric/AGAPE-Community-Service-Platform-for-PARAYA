const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProgramSignupRequestResult =
  | { ok: true; volunteerId: string | null }
  | { ok: false; error: string };

export function isProgramSignupUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Empty request bodies are the volunteer self-signup contract. A supplied
 * body remains strict JSON and may contain only an optional volunteer_id for
 * the separately authorized PARAYA assignment path.
 */
export function parseProgramSignupRequestBody(
  rawBody: string,
): ProgramSignupRequestResult {
  let value: unknown = {};
  if (rawBody.trim()) {
    try {
      value = JSON.parse(rawBody) as unknown;
    } catch {
      return { ok: false, error: "Request body must be valid JSON." };
    }
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const body = value as Record<string, unknown>;
  const unknown = Object.keys(body).filter((field) => field !== "volunteer_id");
  if (unknown.length > 0) {
    return { ok: false, error: `Unexpected field(s): ${unknown.join(", ")}.` };
  }
  if (body.volunteer_id === undefined || body.volunteer_id === null) {
    return { ok: true, volunteerId: null };
  }
  if (
    typeof body.volunteer_id !== "string"
    || !isProgramSignupUuid(body.volunteer_id)
  ) {
    return { ok: false, error: "volunteer_id must be a UUID." };
  }
  return { ok: true, volunteerId: body.volunteer_id };
}
