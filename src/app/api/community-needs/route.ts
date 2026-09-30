import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasCapability } from "@/lib/auth/capabilities";
import { notifyMany } from "@/lib/notifications/dispatch";

const createSchema = z.object({
  barangay_id: z.string().uuid().optional().nullable(),
  category: z.enum(["health", "livelihood", "education", "infrastructure", "environment"]),
  title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"), affected_count: z.number().int().nonnegative().max(1_000_000).optional().nullable(),
  sitio: z.string().trim().max(120).optional().nullable(),
  observation_id: z.string().uuid().optional(),
}).strict();

const REVIEW_STATUSES = ["pending_paraya_review", "needs_revision", "approved", "rejected"] as const;

const fields = "id, submitted_by, barangay_id, category, title, description, priority, affected_count, sitio, source, approval_status, approved_by, approved_at, approval_notes, created_at, updated_at, users!submitted_by(full_name), barangays(name)";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const auth = await authorizeCapability("community_need.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const wanted = new URL(request.url).searchParams.get("status");
  if (wanted && !["all", "draft", "approved", "pending_paraya_review", "needs_revision", "rejected"].includes(wanted)) return NextResponse.json({ error: "Invalid community need status" }, { status: 400, headers });
  try {
  const admin = createAdminClient();
  let query = admin.from("community_needs").select(fields).order("created_at", { ascending: false }).limit(500);
  const global = hasCapability(auth.actor.role, auth.actor.permissions, "community_need.manage");
  if (!global) {
    if (!auth.actor.barangayId) return NextResponse.json({ error: "A barangay assignment is required" }, { status: 403, headers });
    query = query.eq("barangay_id", auth.actor.barangayId);
  } else if (!wanted || wanted === "approved") query = query.eq("approval_status", "approved");
  if (wanted && wanted !== "all" && !(global && wanted === "approved")) query = query.eq("approval_status", wanted);
  // Per-status totals in the reader's scope, independent of the status filter, for the summary cards.
  const countStatus = (status: string) => {
    const count = admin.from("community_needs").select("id", { count: "exact", head: true }).eq("approval_status", status);
    return global ? count : count.eq("barangay_id", auth.actor.barangayId!);
  };
  const [{ data, error }, countResults] = await Promise.all([query, Promise.all(REVIEW_STATUSES.map(countStatus))]);
  if (error) return NextResponse.json({ error: "Community needs are temporarily unavailable. If retrying does not help, contact the administrator." }, { status: error.code === "42501" ? 403 : 503, headers });
  const counts = countResults.some((result) => result.error || result.count === null)
    ? null
    : Object.fromEntries(REVIEW_STATUSES.map((status, index) => [status, countResults[index].count]));
  return NextResponse.json({ data, counts }, { headers });
  } catch {
    return NextResponse.json({ error: "Community needs are temporarily unavailable. If retrying does not help, contact the administrator." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeAnyCapability(["community_need.submit", "community_need.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid community need" }, { status: 400 });
  const global = hasCapability(auth.actor.role, auth.actor.permissions, "community_need.manage");
  const barangayId = global ? parsed.data.barangay_id : auth.actor.barangayId;
  if (!global && parsed.data.barangay_id && parsed.data.barangay_id !== auth.actor.barangayId) return NextResponse.json({ error: "Cross-barangay intake is not allowed" }, { status: 403 });
  if (!barangayId) return NextResponse.json({ error: "Barangay is required" }, { status: 400 });
  const admin = createAdminClient();
  const { data: id, error } = await auth.supabase.rpc("phase1_create_community_need", { p_payload: { ...parsed.data, barangay_id: barangayId } });
  if (error) return NextResponse.json({ error: error.code === "40001" ? "This observation has already been promoted. Refresh to view the need." : "Unable to submit community need. Check barangay readiness and your permissions." }, { status: error.code === "42501" ? 403 : error.code === "40001" ? 409 : ["22023", "23514"].includes(error.code ?? "") ? 422 : 500 });
  const { data } = await auth.supabase.from("community_needs").select(fields).eq("id", id).single();
  {
    const { data: researchers } = await admin.from("users").select("id").eq("role", "paraya_officer").eq("status", "active").eq("is_active", true);
    await notifyMany((researchers ?? []).filter(researcher => researcher.id !== auth.actor.id).map((researcher) => researcher.id), { title: "Community need awaiting PARAYA review", message: "A community need requires PARAYA Officer review.", type: "approval", action_url: "/officer/community-needs?status=pending_paraya_review" });
  }
  return NextResponse.json({ data: data ?? { id, approval_status: "pending_paraya_review" } }, { status: 201 });
}
