import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { recordAudit } from "@/lib/audit/log";
import { generateProposalAssist, proposalAssistRequestSchema, ProposalAssistUnavailableError } from "@/lib/ai/proposal-assist";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Advisory writing help for a proposal draft. It returns text only and never saves or submits. */
export async function POST(request: Request) {
  const auth = await authorizeCapability("ai.assist");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { role, permissions } = auth.actor;
  if (!hasCapability(role, permissions, "proposal.create") && !hasCapability(role, permissions, "contributor.proposal.create")) {
    return json({ error: "Forbidden" }, 403);
  }

  const parsed = proposalAssistRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid writing-help request" }, 400);
  }

  const audited = await recordAudit({
    user_id: auth.actor.id,
    user_email: auth.actor.email,
    action: "ai.proposal_assist.requested",
    resource_type: "proposal_draft",
    // Sizes only: the draft text itself is not copied into the audit log.
    metadata: {
      task: parsed.data.task,
      description_length: parsed.data.draft.description.length,
      budget_line_count: parsed.data.draft.budgetLines.length,
      sdg_count: parsed.data.draft.sdgs.length,
    },
  });
  if (!audited) return json({ error: "AI writing help could not be audited" }, 503);

  try {
    const { result, provider } = await generateProposalAssist(parsed.data);
    return json({ data: result, provider });
  } catch (error) {
    if (error instanceof ProposalAssistUnavailableError) return json({ error: "AI writing help is not available right now" }, 503);
    console.error("Proposal writing help failed", { task: parsed.data.task, message: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return json({ error: "The AI could not answer this time. Try again." }, 502);
  }
}
