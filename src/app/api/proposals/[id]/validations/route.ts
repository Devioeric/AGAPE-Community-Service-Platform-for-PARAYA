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

const createValidationResultSchema = z.object({ id: z.string().uuid() }).strict();
const proposalIdSchema = z.string().uuid();

// ── GET: list every validation event with stakeholders + evidence ───────────
export async function GET(_req: Request, { params }: Ctx) {
  const { id }   = await params;
  const auth = await authorizeCapability("proposal.validation.record");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!proposalIdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid proposal id" }, { status: 400 });

  const admin = createAdminClient();
  if (auth.actor.role.startsWith("barangay_")) {
    const { data: proposal, error: proposalError } = await admin.from("project_proposals").select("barangay_id").eq("id", id).maybeSingle();
    if (proposalError) return NextResponse.json({ error: "Proposal validation context could not be loaded" }, { status: 500 });
    if (!auth.actor.barangayId || !proposal || proposal.barangay_id !== auth.actor.barangayId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  const { data: validations, error } = await admin
    .from("proposal_validations")
    .select("id, method, date_conducted, summary, recorded_by, created_at, users:recorded_by(full_name)")
    .eq("proposal_id", id)
    .order("date_conducted", { ascending: false });

  if (error) {
    console.error("Proposal validation events could not be loaded", { proposalId: id, code: error.code });
    return NextResponse.json({ error: "Proposal validation events could not be loaded" }, { status: 500 });
  }

  const validationIds = (validations ?? []).map((v) => v.id);
  if (validationIds.length === 0) return NextResponse.json({ data: [] });

  // Fetch stakeholders and evidence in two parallel queries, then stitch.
  const [stakeholderResult, evidenceResult] = await Promise.all([
    admin.from("proposal_validation_stakeholders")
      .select("id, validation_id, stakeholder_name, role, present, created_at")
      .in("validation_id", validationIds),
    admin.from("proposal_validation_evidence")
      .select("id, validation_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at, users:uploaded_by(full_name)")
      .in("validation_id", validationIds),
  ]);
  if (stakeholderResult.error || evidenceResult.error) {
    console.error("Proposal validation details could not be loaded", {
      proposalId: id,
      stakeholderCode: stakeholderResult.error?.code,
      evidenceCode: evidenceResult.error?.code,
    });
    return NextResponse.json({ error: "Proposal validation details could not be loaded" }, { status: 500 });
  }
  const stakeholders = stakeholderResult.data;
  const evidence = evidenceResult.data;

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
    const { data: signed, error: signedError } = await admin.storage.from(BUCKET)
      .createSignedUrl(e.storage_path as string, 300);
    if (signedError || !signed?.signedUrl) {
      console.error("Proposal validation evidence URL could not be issued", { proposalId: id, evidenceId: e.id });
      return NextResponse.json({ error: "Proposal validation evidence could not be opened" }, { status: 500 });
    }
    arr.push({
      id: e.id,
      validation_id: e.validation_id,
      file_name: e.file_name,
      mime_type: e.mime_type,
      file_size: e.file_size,
      uploaded_by: e.uploaded_by,
      created_at: e.created_at,
      url: signed.signedUrl,
      uploader: (e.users as unknown as { full_name?: string | null } | null)?.full_name ?? null,
    });
    evidenceByValidation.set(e.validation_id as string, arr);
  }

  if ((evidence ?? []).length > 0) {
    const { error: auditError } = await admin.from("audit_logs").insert({
      user_id: auth.actor.id,
      user_email: auth.actor.email,
      action: "proposal.validation_evidence.read",
      resource_type: "project_proposal",
      resource_id: id,
      level: "info",
      metadata: { evidence_count: (evidence ?? []).length },
    });
    if (auditError) {
      console.error("Proposal validation evidence read audit failed", { proposalId: id, code: auditError.code });
      return NextResponse.json({ error: "Proposal validation evidence access could not be audited" }, { status: 500 });
    }
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
  if (!proposalIdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid proposal id" }, { status: 400 });

  const parsed = createValidationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid validation record" }, { status: 400 });
  const body = parsed.data;
  const cleanStakeholders = body.stakeholders.map((stakeholder) => ({
    name: stakeholder.name,
    role: stakeholder.role || null,
    present: stakeholder.present,
  }));

  const { data, error } = await auth.supabase.rpc("proposal_create_validation_event", {
    p_proposal_id: id,
    p_method: body.method,
    p_date_conducted: body.date_conducted,
    p_summary: body.summary,
    p_stakeholders: cleanStakeholders,
  });
  if (error) {
    const status = error.code === "42501" ? 403
      : error.code === "P0002" ? 404
        : error.code === "40001" ? 409
          : error.code === "22023" ? 400
            : 500;
    console.error("Proposal validation creation failed", { proposalId: id, code: error.code });
    return NextResponse.json({ error: "The validation event could not be recorded" }, { status });
  }
  const result = createValidationResultSchema.safeParse(data);
  if (!result.success) {
    console.error("Proposal validation creation returned an invalid result", { proposalId: id });
    return NextResponse.json({ error: "The validation event returned an invalid result" }, { status: 500 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
