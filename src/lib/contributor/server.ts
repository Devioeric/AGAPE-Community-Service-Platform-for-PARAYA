import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthorizedActor } from "@/lib/auth/authorize";
import type { ContributorProposalSummary } from "@/lib/contributor/contracts";

/**
 * Read the server-authoritative entity links for a Contributor.  This helper
 * is deliberately narrow: it returns identifiers only, never resident or
 * proposal data, and treats a service-client failure as unavailable rather
 * than as an empty assignment set.
 */
export async function contributorPartnerIds(
  contributorUserId: string,
): Promise<{ ids: string[]; error: string | null }> {
  try {
    const admin = createAdminClient();
    const result = await admin
      .from("contributor_partner_links")
      .select("partner_id")
      .eq("contributor_user_id", contributorUserId)
      .eq("status", "active");
    if (result.error) {
      return { ids: [], error: "Contributor assignments are temporarily unavailable" };
    }
    const ids = (result.data ?? [])
      .map((row) => row.partner_id)
      .filter((id): id is string => typeof id === "string");
    return { ids: Array.from(new Set(ids)), error: null };
  } catch {
    return { ids: [], error: "Contributor assignments are temporarily unavailable" };
  }
}

type RpcRow = {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  rowVersion?: unknown;
  originatingPartnerId?: unknown;
  leadBarangayId?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Convert the existing V2 RPC list into a small, contributor-safe DTO. */
export async function contributorProposalSummaries(
  actor: AuthorizedActor,
  rows: unknown,
  partnerFilter?: string,
): Promise<{ data: ContributorProposalSummary[]; error: string | null }> {
  const rpcRows = Array.isArray(rows) ? rows as RpcRow[] : [];
  const filtered = rpcRows.filter((row) => !partnerFilter || row.originatingPartnerId === partnerFilter);
  const ids = filtered.map((row) => asString(row.id)).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return { data: [], error: null };

  const admin = createAdminClient();
  const [proposalRows, barangayRows] = await Promise.all([
    admin.from("project_proposals").select("id,rationale,created_at,updated_at,created_by").in("id", ids).eq("created_by", actor.id),
    admin.from("barangays").select("id,name").in("id", filtered.map((row) => asString(row.leadBarangayId)).filter((id): id is string => Boolean(id))),
  ]);
  if (proposalRows.error || barangayRows.error) {
    return { data: [], error: "Contributor proposals are temporarily unavailable" };
  }
  const proposals = new Map((proposalRows.data ?? []).map((row) => [row.id, row]));
  const barangays = new Map((barangayRows.data ?? []).map((row) => [row.id, row.name]));
  return {
    data: filtered.flatMap((row) => {
      const id = asString(row.id);
      const proposal = id ? proposals.get(id) : null;
      if (!id || !proposal) return [];
      return [{
        id,
        partnerId: asString(row.originatingPartnerId),
        title: asString(row.title) ?? "Untitled proposal",
        summary: asString(proposal.rationale) ?? "",
        status: asString(row.status) ?? "draft",
        rowVersion: typeof row.rowVersion === "number" ? row.rowVersion : 1,
        targetBarangayId: asString(row.leadBarangayId),
        targetBarangayName: asString(row.leadBarangayId) ? (barangays.get(row.leadBarangayId as string) ?? null) : null,
        createdAt: asString(proposal.created_at),
        updatedAt: asString(proposal.updated_at),
      } satisfies ContributorProposalSummary];
    }),
    error: null,
  };
}

