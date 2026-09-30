import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit } from "@/lib/audit/log";
import { LEGACY_PAGE_SIZE, legacySearchPattern, parseLegacyListParams, type LegacyHouseholdPage } from "./legacy-household-contract";

const LEGACY_SAFE_FIELDS = "id, barangay_id, household_number, member_count, sitio, collected_at, legacy_data_status, barangays(name)";
type Result = { status: number; body: LegacyHouseholdPage | { error: string }; timing: string };

/** Every server/API read independently authorizes and awaits its audit. */
export async function loadLegacyHouseholds(params: URLSearchParams): Promise<Result> {
  const started = performance.now();
  const durations: string[] = [];
  let last = started;
  const mark = (name: string) => { const now = performance.now(); durations.push(`${name};dur=${(now - last).toFixed(1)}`); last = now; };
  const finish = (status: number, body: Result["body"]): Result => ({ status, body, timing: [...durations, `total;dur=${(performance.now() - started).toFixed(1)}`].join(", ") });
  try {
    const auth = await authorizeCapability("profiling.detail.read");
    mark("authorize");
    if (!auth.ok) return finish(auth.status, { error: auth.error });
    const input = parseLegacyListParams(params);
    if (!input) return finish(400, { error: "Use a valid page and a search of up to 80 letters, numbers, spaces, apostrophes, dots, underscores or hyphens." });
    let effectiveBarangayId: string | null = null;
    if (auth.actor.role === "barangay_secretary") {
      if (!auth.actor.barangayId || (input.barangayId && input.barangayId !== auth.actor.barangayId)) return finish(403, { error: "Forbidden" });
      effectiveBarangayId = auth.actor.barangayId;
    } else if (auth.actor.role === "paraya_officer") {
      effectiveBarangayId = input.barangayId;
    } else return finish(403, { error: "Forbidden" });
    const auditRecorded = await recordAudit({
      user_id: auth.actor.id, user_email: auth.actor.email,
      action: "Legacy household summary viewed", resource_type: "household_profiles", level: "warning",
      // Never log the potentially identifying search text.
      metadata: { barangay_id: effectiveBarangayId, fields: LEGACY_SAFE_FIELDS, page: input.page, page_size: LEGACY_PAGE_SIZE },
    });
    mark("audit");
    if (!auditRecorded) return finish(503, { error: "Unable to establish the required audit trail" });
    const admin = createAdminClient();
    let query = admin.from("household_profiles").select(LEGACY_SAFE_FIELDS)
      .order("collected_at", { ascending: false }).order("id", { ascending: false });
    if (effectiveBarangayId) query = query.eq("barangay_id", effectiveBarangayId);
    if (input.q) {
      const pattern = legacySearchPattern(input.q);
      let barangays = admin.from("barangays").select("id").ilike("name", pattern).limit(101);
      if (effectiveBarangayId) barangays = barangays.eq("id", effectiveBarangayId);
      const { data: matches, error } = await barangays;
      if (error) return finish(503, { error: "Unable to search legacy records. Please retry." });
      if ((matches?.length ?? 0) > 100) return finish(400, { error: "Please use a more specific barangay search." });
      const ids = (matches ?? []).map((row) => row.id);
      const quoted = JSON.stringify(pattern);
      query = query.or(`household_number.ilike.${quoted},sitio.ilike.${quoted}${ids.length ? `,barangay_id.in.(${ids.join(",")})` : ""}`);
    }
    const from = (input.page - 1) * LEGACY_PAGE_SIZE;
    const { data, error } = await query.range(from, from + LEGACY_PAGE_SIZE);
    mark("query");
    if (error) return finish(503, { error: "Unable to load legacy records. Please retry." });
    const rows = data ?? [];
    return finish(200, {
      data: rows.slice(0, LEGACY_PAGE_SIZE).map((profile) => ({ ...profile,
        barangays: Array.isArray(profile.barangays) ? profile.barangays[0] ?? null : profile.barangays,
        legacy_data_status: profile.legacy_data_status ?? "legacy_unverified" })),
      pagination: { page: input.page, pageSize: LEGACY_PAGE_SIZE, hasNextPage: rows.length > LEGACY_PAGE_SIZE },
    });
  } catch {
    return finish(503, { error: "Unable to load legacy records. Please retry." });
  }
}
