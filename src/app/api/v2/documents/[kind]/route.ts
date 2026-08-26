import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { readLimitedFormData, RequestBodyTooLargeError } from "@/lib/http/limited-form-data";
import { generatedDocumentPath, PHASE2_DOCUMENT_BUCKET, PHASE2_DOCUMENT_MAX_BYTES, validatePhase2Document } from "@/lib/phase2/documents";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";
import { createAdminClient } from "@/lib/supabase/admin";

const kindSchema = z.enum(["partnership", "historical", "proposal_budget", "program_finance"]);
const COMPONENT = { partnership: "partners", historical: "historical_programs", proposal_budget: "proposals", program_finance: "program_finance" } as const;

export async function GET(request: Request, { params }: { params: { kind: string } }) {
  const kind = kindSchema.safeParse(params.kind);
  if (!kind.success) return NextResponse.json({ error: "Unknown document kind" }, { status: 404 });
  const auth = await authorizeAnyCapability(["partner.document.read", "historical_program.read", "budget.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const component = COMPONENT[kind.data];
  if (!isPhase2ComponentEnabled(component)) return phase2DisabledResponse(component);
  const parentId = new URL(request.url).searchParams.get("parent_id") ?? "";
  if (!z.string().uuid().safeParse(parentId).success) return NextResponse.json({ error: "A valid parent_id is required" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_list_documents", { p_kind: kind.data, p_parent_id: parentId });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: { kind: string } }) {
  const kind = kindSchema.safeParse(params.kind);
  if (!kind.success) return NextResponse.json({ error: "Unknown document kind" }, { status: 404 });
  const auth = await authorizeAnyCapability(["partner.document.manage", "historical_program.create", "budget.prepare", "budget.actual.record"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const component = COMPONENT[kind.data];
  if (!isPhase2ComponentEnabled(component)) return phase2DisabledResponse(component);
  let form: FormData;
  try { form = await readLimitedFormData(request, PHASE2_DOCUMENT_MAX_BYTES + 500_000); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestBodyTooLargeError ? "Document exceeds 10 MB" : "Multipart upload required" }, { status: error instanceof RequestBodyTooLargeError ? 413 : 400 }); }
  const file = form.get("file"); const parentId = String(form.get("parent_id") ?? ""); const termId = String(form.get("term_id") ?? "") || null;
  if (!(file instanceof File) || !z.string().uuid().safeParse(parentId).success) return NextResponse.json({ error: "file and valid parent_id are required" }, { status: 400 });
  const documentType = String(form.get("document_type") ?? "other");
  const validDocumentType = kind.data === "partnership" ? ["moa", "mou", "agreement", "renewal", "other"].includes(documentType)
    : kind.data === "proposal_budget" ? ["quotation", "source_budget", "supporting"].includes(documentType)
      : documentType.length >= 1 && documentType.length <= 80;
  const visibility = String(form.get("visibility") ?? "paraya_only");
  if (!validDocumentType || !["paraya_only", "linked_barangay"].includes(visibility)) return NextResponse.json({ error: "Invalid document metadata" }, { status: 400 });
  try {
    const bytes = new Uint8Array(await file.arrayBuffer()); const checked = validatePhase2Document(file, bytes);
    const path = generatedDocumentPath(parentId, checked.extension, checked.sha256); const bucket = PHASE2_DOCUMENT_BUCKET[kind.data]; const admin = createAdminClient();
    const uploaded = await admin.storage.from(bucket).upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploaded.error) return NextResponse.json({ error: "Unable to quarantine document" }, { status: 500 });
    const { data, error } = await auth.supabase.rpc("phase2_register_document", { p_kind: kind.data, p_parent_id: parentId, p_term_id: termId, p_metadata: {
      document_type: documentType, original_name: checked.safeOriginalName, storage_path: path,
      sha256: checked.sha256, mime_type: file.type, size_bytes: file.size, effective_on: String(form.get("effective_on") ?? "") || null,
      expires_on: String(form.get("expires_on") ?? "") || null, visibility,
    } });
    if (error) { await admin.storage.from(bucket).remove([path]); return phase2RpcError(error); }
    return NextResponse.json({ data: { id: data, scanStatus: "quarantined" } }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid document" }, { status: 400 }); }
}
