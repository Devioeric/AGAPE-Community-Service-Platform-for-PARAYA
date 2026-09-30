import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMMUNITY_PROFILE_SCHEMA_VERSION } from "@/lib/community-profile/catalog";
import { communityProfileDataSchema, communityProfileInputSchema } from "@/lib/community-profile/schema";
import { PROFILE_COLUMNS, keyFigures, profileScope, scopeAllows } from "@/lib/community-profile/server";

const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().uuid();
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers });

export async function GET(_request: Request, { params }: { params: Promise<{ barangayId: string }> }) {
  const auth = await authorizeCapability("profiling.aggregate.read");
  if (!auth.ok) return fail(auth.status, auth.error);
  const { barangayId } = await params;
  if (!idSchema.safeParse(barangayId).success) return fail(404, "Barangay not found");
  if (!scopeAllows(profileScope(auth.actor), barangayId)) return fail(403, "Forbidden");

  const admin = createAdminClient();
  const [barangay, profile] = await Promise.all([
    admin.from("barangays").select("id, name").eq("id", barangayId).maybeSingle(),
    admin.from("barangay_community_profiles").select(PROFILE_COLUMNS).eq("barangay_id", barangayId).maybeSingle(),
  ]);
  if (barangay.error || profile.error) return fail(503, "The community profile is temporarily unavailable");
  if (!barangay.data) return fail(404, "Barangay not found");
  if (!profile.data) return NextResponse.json({ data: { barangay: barangay.data, profile: null } }, { headers });

  const parsed = communityProfileDataSchema.safeParse(profile.data.data);
  return NextResponse.json({
    data: { barangay: barangay.data, profile: { ...profile.data, data: parsed.success ? parsed.data : {}, data_valid: parsed.success } },
  }, { headers });
}

export async function PUT(request: Request, { params }: { params: Promise<{ barangayId: string }> }) {
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return fail(auth.status, auth.error);
  const { barangayId } = await params;
  if (!idSchema.safeParse(barangayId).success) return fail(404, "Barangay not found");
  const parsed = communityProfileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    return NextResponse.json({ error: "Check the highlighted fields", issues }, { status: 400, headers });
  }

  const admin = createAdminClient();
  const barangay = await admin.from("barangays").select("id").eq("id", barangayId).eq("is_active", true).maybeSingle();
  if (barangay.error) return fail(503, "The community profile is temporarily unavailable");
  if (!barangay.data) return fail(404, "Barangay not found");
  const { expected_updated_at: expected, ...fields } = parsed.data;
  const row = { ...fields, schema_version: COMMUNITY_PROFILE_SCHEMA_VERSION, updated_by: auth.actor.id, updated_at: new Date().toISOString() };
  const table = admin.from("barangay_community_profiles");
  const saved = expected === null
    ? await table.insert({ barangay_id: barangayId, ...row }).select(PROFILE_COLUMNS).maybeSingle()
    : await table.update(row).eq("barangay_id", barangayId).eq("updated_at", expected).select(PROFILE_COLUMNS).maybeSingle();
  if (saved.error?.code === "23505" || (!saved.error && !saved.data)) return fail(409, "This profile was changed by someone else. Reload to see the latest version.");
  if (saved.error || !saved.data) return fail(503, "The community profile could not be saved");

  await recordAudit({
    user_id: auth.actor.id,
    user_email: auth.actor.email,
    action: expected === null ? "community_profile.created" : "community_profile.updated",
    resource_type: "barangay_community_profile",
    resource_id: saved.data.id,
    metadata: { barangay_id: barangayId, indicators_reported: Object.keys(fields.data).length },
  });
  return NextResponse.json({ data: { ...saved.data, key_figures: keyFigures(fields.data) } }, { headers });
}
