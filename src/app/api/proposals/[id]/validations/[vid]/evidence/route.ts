import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string; vid: string }> };

const BUCKET    = "proposal-validation-evidence";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — generous for FGD minutes PDFs

// Allow a wider set than activity-photos: officers commonly attach PDFs of
// minutes, photos, scanned attendance sheets, even short audio.
const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/gif",
  "application/pdf",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/webm",
];

// POST — upload one evidence file (multipart/form-data with "file" field).
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("proposal.validation.record");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: proposalId, vid } = await params;
  const admin = createAdminClient();
  if (auth.actor.role.startsWith("barangay_")) {
    const { data: proposal } = await admin.from("project_proposals").select("barangay_id").eq("id", proposalId).maybeSingle();
    if (!auth.actor.barangayId || !proposal || proposal.barangay_id !== auth.actor.barangayId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: validation } = await admin
    .from("proposal_validations")
    .select("id")
    .eq("id", vid)
    .eq("proposal_id", proposalId)
    .single();
  if (!validation) {
    return NextResponse.json({ error: "Validation event not found" }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.` },
      { status: 413 }
    );
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Allowed: images, PDFs, audio." },
      { status: 415 }
    );
  }

  // Deterministic path: validations/<vid>/<uuid>.<ext>
  const ext  = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `validations/${vid}/${crypto.randomUUID()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type, upsert: false,
  });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });

  const { data: row, error: dbErr } = await admin
    .from("proposal_validation_evidence")
    .insert({
      validation_id: vid,
      storage_path:  path,
      file_name:     file.name,
      mime_type:     file.type,
      file_size:     file.size,
      uploaded_by:   auth.actor.id,
    })
    .select("id, storage_path, file_name, mime_type, file_size, created_at")
    .single();

  if (dbErr) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  const { data: signed } = await admin.storage.from(BUCKET)
    .createSignedUrl(path, 3600);

  return NextResponse.json({
    data: { ...row, url: signed?.signedUrl ?? null },
  }, { status: 201 });
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
