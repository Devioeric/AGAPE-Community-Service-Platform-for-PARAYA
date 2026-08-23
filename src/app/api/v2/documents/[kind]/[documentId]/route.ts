import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { phase2RpcError } from "@/lib/phase2/feature";

const kindSchema = z.enum(["partnership", "historical", "proposal_budget", "program_finance"]);
export async function GET(_request: Request, { params }: { params: { kind: string; documentId: string } }) {
  const kind = kindSchema.safeParse(params.kind);
  if (!kind.success) return NextResponse.json({ error: "Unknown document kind" }, { status: 404 });
  const auth = await authorizeAnyCapability(["partner.document.read", "partnership.read", "historical_program.read", "budget.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase2_authorize_document_read", { p_kind: kind.data, p_document_id: params.documentId });
  if (error) return phase2RpcError(error);
  const location = data as { bucket: string; path: string };
  const signed = await createAdminClient().storage.from(location.bucket).createSignedUrl(location.path, 300);
  if (signed.error) return NextResponse.json({ error: "Unable to issue document URL" }, { status: 500 });
  return NextResponse.json({ data: { url: signed.data.signedUrl, expiresIn: 300 } }, { headers: { "cache-control": "no-store" } });
}
