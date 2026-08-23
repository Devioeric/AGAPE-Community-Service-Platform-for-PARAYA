import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const BUCKET = "proposal-validation-evidence";

const VALID_METHODS = [
  "fgd", "key_informant", "town_hall", "consultation", "door_to_door", "other",
] as const;

const createValidationSchema = z.object({
  method: z.enum(VALID_METHODS),
  date_conducted: z.string().date(),
  summary: z.string().trim().min(20).max(5_000),
  stakeholders: z.array(z.object({
    name: z.string().trim().min(2).max(160),
    role: z.string().trim().max(120).optional(),
    present: z.boolean().default(true),
  }).strict()).min(3).max(100),
}).strict();

// ── GET: list every validation event with stakeholders + evidence ───────────
export async function GET(_req: Request, { params }: Ctx) {
  const { id }   = await params;
  const auth = await authorizeCapability("proposal.validation.record");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  if (auth.actor.role.startsWith("barangay_")) {
    const { data: proposal } = await admin.from("project_proposals").select("barangay_id").eq("id", id).maybeSingle();
    if (!auth.actor.barangayId || !proposal || proposal.barangay_id !== auth.actor.barangayId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  const { data: validations, error } = await admin
    .from("proposal_validations")
    .select("id, method, date_conducted, summary, recorded_by, created_at, users:recorded_by(full_name)")
    .eq("proposal_id", id)
    .order("date_conducted", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const validationIds = (validations ?? []).map((v) => v.id);
  if (validationIds.length === 0) return NextResponse.json({ data: [] });

  // Fetch stakeholders and evidence in two parallel queries, then stitch.
  const [{ data: stakeholders }, { data: evidence }] = await Promise.all([
    admin.from("proposal_validation_stakeholders")
      .select("id, validation_id, stakeholder_name, role, present, created_at")
      .in("validation_id", validationIds),
    admin.from("proposal_validation_evidence")
      .select("id, validation_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at, users:uploaded_by(full_name)")
      .in("validation_id", validationIds),
  ]);

  const stakeholdersByValidation = new Map<string, unknown[]>();
  for (const s of stakeholders ?? []) {
    const arr = stakeholdersByValidation.get(s.validation_id as string) ?? [];
    arr.push(s);
    stakeholdersByValidation.set(s.validation_id as string, arr);
  }

  const evidenceByValidation = new Map<string, unknown[]>();
  for (const e of evidence ?? []) {
    const arr = evidenceByValidation.get(e.validation_id as string) ?? [];
    // Generate a short-lived signed URL — bucket is private.
    const { data: signed } = await admin.storage.from(BUCKET)
      .createSignedUrl(e.storage_path as string, 3600);
    arr.push({
      ...e,
      url:      signed?.signedUrl ?? null,
      uploader: (e.users as unknown as { full_name?: string | null } | null)?.full_name ?? null,
    });
    evidenceByValidation.set(e.validation_id as string, arr);
  }

  const enriched = (validations ?? []).map((v) => ({
    id:             v.id,
    method:         v.method,
    date_conducted: v.date_conducted,
    summary:        v.summary,
    recorded_by:    v.recorded_by,
    recorder_name:  (v.users as unknown as { full_name?: string | null } | null)?.full_name ?? null,
    created_at:     v.created_at,
    stakeholders:   stakeholdersByValidation.get(v.id as string) ?? [],
    evidence:       evidenceByValidation.get(v.id as string) ?? [],
  }));

  return NextResponse.json({ data: enriched });
}

// ── POST: create a new validation event (with stakeholders) ─────────────────
// Body: { method, date_conducted, summary, stakeholders: [{ name, role?, present? }] }
// Evidence files are uploaded via the separate /evidence endpoint afterward.
export async function POST(request: Request, { params }: Ctx) {
  const { id }   = await params;
  const auth = await authorizeCapability("proposal.validation.record");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = createValidationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid validation record" }, { status: 400 });
  const body = parsed.data;
  const cleanStakeholders = body.stakeholders.map((stakeholder) => ({
    name: stakeholder.name,
    role: stakeholder.role || null,
    present: stakeholder.present,
  }));

  const admin = createAdminClient();
  if (auth.actor.role.startsWith("barangay_")) {
    const { data: proposal } = await admin.from("project_proposals").select("barangay_id").eq("id", id).maybeSingle();
    if (!auth.actor.barangayId || !proposal || proposal.barangay_id !== auth.actor.barangayId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  const { data: validation, error: vErr } = await admin
    .from("proposal_validations")
    .insert({
      proposal_id:    id,
      method:         body.method,
      date_conducted: body.date_conducted,
      summary:        body.summary.trim(),
      recorded_by:    auth.actor.id,
    })
    .select("id")
    .single();

  if (vErr || !validation) {
    return NextResponse.json({ error: vErr?.message ?? "Failed to record validation." }, { status: 500 });
  }

  const { error: sErr } = await admin
    .from("proposal_validation_stakeholders")
    .insert(cleanStakeholders.map((s) => ({
      validation_id:    validation.id,
      stakeholder_name: s.name,
      role:             s.role,
      present:          s.present,
    })));

  if (sErr) {
    // Rollback the validation so we don't leave an orphan with no stakeholders.
    await admin.from("proposal_validations").delete().eq("id", validation.id).then(() => {}, () => {});
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id: validation.id } }, { status: 201 });
}
