import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { recordAudit } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { communityProfileDataSchema } from "@/lib/community-profile/schema";
import { evaluateProfileSignals, PROFILE_SIGNAL_POLICY } from "@/lib/community-profile/need-signals";
import { profileScope } from "@/lib/community-profile/server";

const headers = { "Cache-Control": "private, no-store" };
const bodySchema = z.object({ barangay_id: z.string().uuid(), rule_code: z.string().regex(/^[a-z_]{2,60}$/), decision: z.enum(["accept", "dismiss"]), reason: z.string().trim().min(3).max(1000).optional(), expected_profile_updated_at: z.string().datetime({ offset: true }) }).strict().superRefine((value, ctx) => { if (value.decision === "dismiss" && !value.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "A dismissal reason is required" }); });
export async function POST(request: Request) {
  const auth = await authorizeCapability("community_need.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  if (!hasCapability(auth.actor.role, auth.actor.permissions, "profiling.aggregate.read") || profileScope(auth.actor)?.all !== true) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: "Invalid signal decision", issues: parsedBody.error.issues }, { status: 400, headers });
  const admin = createAdminClient();
  const profile = await admin.from("barangay_community_profiles").select("id,barangay_id,updated_at,data").eq("barangay_id", parsedBody.data.barangay_id).maybeSingle();
  if (profile.error) return NextResponse.json({ error: "Community profile signals are temporarily unavailable" }, { status: 503, headers });
  if (!profile.data) return NextResponse.json({ error: "Community profile not found" }, { status: 404, headers });
  if (profile.data.updated_at !== parsedBody.data.expected_profile_updated_at) return NextResponse.json({ error: "This community profile changed. Reload and try again." }, { status: 409, headers });
  const data = communityProfileDataSchema.safeParse(profile.data.data);
  const signal = data.success ? evaluateProfileSignals(data.data).find((item) => item.code === parsedBody.data.rule_code) : null;
  if (!signal) return NextResponse.json({ error: "This signal no longer applies." }, { status: 409, headers });
  const barangay = await admin.from("barangays").select("name").eq("id", profile.data.barangay_id).maybeSingle();
  if (barangay.error || !barangay.data) return NextResponse.json({ error: "Barangay not found" }, { status: 404, headers });
  const rpc = await admin.rpc("cna_record_profile_signal_decision", { p_payload: { profile_id: profile.data.id, profile_updated_at: profile.data.updated_at, rule_code: signal.code, decision: parsedBody.data.decision, reason: parsedBody.data.reason ?? null, evidence: { percent: signal.percent, count: signal.count, total: signal.total, indicator: signal.indicator, policy: PROFILE_SIGNAL_POLICY }, title: `${signal.title} in ${barangay.data.name}`, description: signal.description, category: signal.category, priority: signal.priority, affected_count: signal.affectedCount, decided_by: auth.actor.id } });
  if (rpc.error) return NextResponse.json({ error: rpc.error.code === "40001" ? "This community profile changed. Reload and try again." : "The signal decision could not be recorded" }, { status: rpc.error.code === "40001" || rpc.error.code === "23505" ? 409 : 503, headers });
  await recordAudit({ user_id: auth.actor.id, user_email: auth.actor.email, action: parsedBody.data.decision === "accept" ? "community_profile_signal.accepted" : "community_profile_signal.dismissed", resource_type: "barangay_community_profile", resource_id: profile.data.id, metadata: { barangay_id: profile.data.barangay_id, rule_code: signal.code } });
  return NextResponse.json({ data: { need_id: (rpc.data as { need_id?: string | null } | null)?.need_id ?? null } }, { headers });
}
