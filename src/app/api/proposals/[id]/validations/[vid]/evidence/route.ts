import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { proposalValidationEvidencePath, validateProposalValidationEvidence } from "@/lib/proposals/validation-evidence";
import { NextResponse } from "next/server";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string; vid: string }> };

const BUCKET    = "proposal-validation-evidence";
const idSchema = z.string().uuid();

// POST — upload one evidence file (multipart/form-data with "file" field).
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("proposal.validation.record");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: proposalId, vid } = await params;
  if (!idSchema.safeParse(proposalId).success || !idSchema.safeParse(vid).success) {
    return NextResponse.json({ error: "Invalid proposal or validation id" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: proposal, error: proposalError } = await admin.from("project_proposals")
    .select("id,barangay_id,status")
    .eq("id", proposalId)
    .maybeSingle();
  if (proposalError) return NextResponse.json({ error: "Proposal validation context could not be loaded" }, { status: 500 });
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (!["draft", "submitted", "revisions_requested"].includes(proposal.status)) {
    return NextResponse.json({ error: "Evidence can only be added while the proposal is editable" }, { status: 409 });
  }
  if (auth.actor.role.startsWith("barangay_")) {
    if (!auth.actor.barangayId || !proposal || proposal.barangay_id !== auth.actor.barangayId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: validation, error: validationError } = await admin
    .from("proposal_validations")
    .select("id")
    .eq("id", vid)
    .eq("proposal_id", proposalId)
    .maybeSingle();
  if (validationError) return NextResponse.json({ error: "Validation event could not be verified" }, { status: 500 });
  if (!validation) {
    return NextResponse.json({ error: "Validation event not found" }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid evidence upload" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let verifiedFile: ReturnType<typeof validateProposalValidationEvidence>;
  try {
    verifiedFile = validateProposalValidationEvidence(file, bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid evidence file";
    const status = message.includes("10 MB") ? 413 : message.includes("MIME") ? 415 : 422;
    return NextResponse.json({ error: message }, { status });
  }
  const path = proposalValidationEvidencePath(vid, verifiedFile.extension, verifiedFile.sha256);
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type, upsert: false,
  });
  if (upErr) {
    console.error("Proposal validation evidence upload failed", { proposalId, validationId: vid, code: upErr.name });
    return NextResponse.json({ error: "Evidence upload failed" }, { status: 500 });
  }

  const { data: row, error: dbErr } = await admin
    .from("proposal_validation_evidence")
    .insert({
      validation_id: vid,
      storage_path:  path,
      file_name:     verifiedFile.safeOriginalName,
      mime_type:     file.type,
      file_size:     file.size,
      uploaded_by:   auth.actor.id,
    })
    .select("id, file_name, mime_type, file_size, created_at")
    .single();

  if (dbErr) {
    const cleanup = await admin.storage.from(BUCKET).remove([path]).catch(() => ({ error: { name: "cleanup_exception" } }));
    console.error("Proposal validation evidence metadata failed", {
      proposalId,
      validationId: vid,
      code: dbErr.code,
      cleanupFailed: Boolean(cleanup.error),
    });
    return NextResponse.json({ error: "Evidence metadata could not be recorded" }, { status: 500 });
  }

  return NextResponse.json({ data: row }, { status: 201 });
}

// DELETE — remove one evidence file. URL: …/evidence?eid=<uuid>
export async function DELETE(request: Request, { params }: Ctx) {
  void request;
  void params;
  return NextResponse.json(
    {
      error:
        "Validation evidence is retained for traceability. Archival and correction history will replace hard deletion.",
      code: "validation_evidence_delete_disabled",
    },
    { status: 405 },
  );
}
