import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasCapability } from "@/lib/auth/capabilities";
import { notifyMany } from "@/lib/notifications/dispatch";

const createSchema = z.object({
  barangay_id: z.string().uuid().optional().nullable(), category: z.string().trim().regex(/^[a-z0-9_.-]{2,60}$/),
  title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"), affected_count: z.number().int().nonnegative().max(1_000_000).optional().nullable(),
  sitio: z.string().trim().max(120).optional().nullable(),
}).strict();

const fields = "id, submitted_by, barangay_id, category, title, description, priority, affected_count, sitio, approval_status, approved_by, approved_at, approval_notes, created_at, updated_at, users!submitted_by(full_name), barangays(name)";

export async function GET(request: Request) {
  const auth = await authorizeCapability("community_need.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const wanted = new URL(request.url).searchParams.get("status");
  const admin = createAdminClient();
  let query = admin.from("community_needs").select(fields).order("created_at", { ascending: false }).limit(500);
  const global = hasCapability(auth.actor.role, auth.actor.permissions, "community_need.manage");
  if (!global) {
    if (!auth.actor.barangayId) return NextResponse.json({ error: "A barangay assignment is required" }, { status: 403 });
    query = query.eq("barangay_id", auth.actor.barangayId);
  } else if (!wanted || wanted === "approved") query = query.eq("approval_status", "approved");
  if (wanted && wanted !== "all" && !(global && wanted === "approved")) query = query.eq("approval_status", wanted);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Unable to load community needs" }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeAnyCapability(["community_need.submit", "community_need.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid community need" }, { status: 400 });
  const global = hasCapability(auth.actor.role, auth.actor.permissions, "community_need.manage");
  const barangayId = global ? parsed.data.barangay_id : auth.actor.barangayId;
  if (!barangayId) return NextResponse.json({ error: "Barangay is required" }, { status: 400 });
  const approved = global || auth.actor.role === "barangay_captain";
  const admin = createAdminClient();
  const { data, error } = await admin.from("community_needs").insert({
    submitted_by: auth.actor.id, barangay_id: barangayId, category: parsed.data.category, title: parsed.data.title,
    description: parsed.data.description ?? null, priority: parsed.data.priority, affected_count: parsed.data.affected_count ?? null,
    sitio: parsed.data.sitio || null, approval_status: approved ? "approved" : "pending_captain",
    approved_by: approved ? auth.actor.id : null, approved_at: approved ? new Date().toISOString() : null,
  }).select(fields).single();
  if (error) return NextResponse.json({ error: "Unable to submit community need" }, { status: 500 });
  if (!approved) {
    const { data: captains } = await admin.from("users").select("id").eq("role", "barangay_captain").eq("barangay_id", barangayId).eq("is_active", true);
    await notifyMany((captains ?? []).map((captain) => captain.id), { title: "Community need awaiting approval", message: `${parsed.data.title} requires review.`, type: "approval", action_url: "/barangay/approvals" });
  }
  return NextResponse.json({ data }, { status: 201 });
}
