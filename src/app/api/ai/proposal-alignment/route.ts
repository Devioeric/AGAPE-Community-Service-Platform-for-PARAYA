import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { assessProposalAlignment, proposalAlignmentRequestSchema } from "@/lib/ai/proposal-alignment";
import { recordAudit } from "@/lib/audit/log";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";

export async function POST(request: Request) {
  const auth = await authorizeCapability("proposal.create");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasCapability(auth.actor.role, auth.actor.permissions, "ai.assist")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = proposalAlignmentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid proposal alignment request" }, { status: 400 });
  }

  const result = assessProposalAlignment(parsed.data.draft);
  const draftFingerprint = createHash("sha256")
    .update(JSON.stringify(parsed.data.draft))
    .digest("hex");
  const auditWritten = await recordAudit({
    user_id: auth.actor.id,
    user_email: auth.actor.email,
    action: "ai.proposal_alignment.assessed",
    resource_type: "proposal_draft_aggregate",
    metadata: {
      schema: result.schema,
      draft_fingerprint: draftFingerprint,
      overall: result.overall,
      dimension_ratings: Object.fromEntries(result.dimensions.map((dimension) => [dimension.code, dimension.rating])),
      sdg_count: parsed.data.draft.sdgs.length,
      has_barangay: parsed.data.draft.barangayId !== null,
      prior_initiative_count: parsed.data.draft.priorInitiativeCount,
    },
  });
  if (!auditWritten) {
    return NextResponse.json({ error: "Unable to audit proposal alignment" }, { status: 503 });
  }

  return NextResponse.json(
    { data: result },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
