// Shapes the Contributor dashboard and proposal list. The proposal IDs always
// come from phase2_list_proposals, which the database already limits to the
// caller's own proposals; the builder drops any row not created by the caller
// as a second check.

export interface ContributorProposalRow {
  id: string;
  title: string;
  status: string;
  partnerId: string | null;
  partnerName: string | null;
  barangayId: string | null;
  barangayName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  cashTotal: number;
  inKindTotal: number;
  sdgs: number[];
  rowVersion: number;
  createdAt: string | null;
  updatedAt: string | null;
  submittedAt: string | null;
  /** Latest reviewer remark, shown to the Contributor as Officer feedback. */
  latestRemark: { text: string; action: string; occurredAt: string } | null;
}

export interface ContributorActivity {
  proposalId: string;
  title: string;
  action: string;
  toStatus: string | null;
  remarks: string | null;
  occurredAt: string;
}

export interface ContributorOverview {
  contributor: { name: string | null; email: string | null };
  organizations: Array<{ id: string; name: string; type: string | null }>;
  proposals: ContributorProposalRow[];
  activity: ContributorActivity[];
}

type Row = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const amount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface OverviewSources {
  actorId: string;
  contributor: { name: string | null; email: string | null };
  /** phase2_list_proposals output. */
  rpcRows: unknown;
  proposals: Row[];
  sdgs: Row[];
  events: Row[];
  barangays: Row[];
  partners: Row[];
  organizationIds: string[];
}

export function buildContributorOverview(sources: OverviewSources): ContributorOverview {
  const owned = new Map<string, Row>();
  for (const row of sources.proposals) {
    const id = text(row.id);
    if (id && row.created_by === sources.actorId) owned.set(id, row);
  }
  const barangays = new Map<string, string>();
  for (const row of sources.barangays) { const id = text(row.id); const name = text(row.name); if (id && name) barangays.set(id, name); }
  const partners = new Map<string, { name: string; type: string | null }>();
  for (const row of sources.partners) {
    const id = text(row.id); const name = text(row.name);
    if (id && name) partners.set(id, { name, type: text(row.entity_type) });
  }
  const sdgsByProposal = new Map<string, number[]>();
  for (const row of sources.sdgs) {
    const id = text(row.proposal_id); const sdg = Number(row.sdg_number);
    if (!id || !Number.isInteger(sdg)) continue;
    const list = sdgsByProposal.get(id) ?? [];
    if (!list.includes(sdg)) list.push(sdg);
    sdgsByProposal.set(id, list);
  }
  // Newest first, so the first match per proposal is its latest event.
  const events = sources.events
    .filter((row) => text(row.proposal_id) && text(row.occurred_at))
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));

  const rpcRows = Array.isArray(sources.rpcRows) ? (sources.rpcRows as Row[]) : [];
  const proposals: ContributorProposalRow[] = [];
  for (const row of rpcRows) {
    const id = text(row.id);
    const own = id ? owned.get(id) : undefined;
    if (!id || !own) continue;
    const proposalEvents = events.filter((event) => event.proposal_id === id);
    const remark = proposalEvents.find((event) => text(event.remarks));
    const submits = proposalEvents.filter((event) => event.action === "submit");
    const budget = (row.budget && typeof row.budget === "object" ? row.budget : {}) as Row;
    const partnerId = text(row.originatingPartnerId);
    const barangayId = text(row.leadBarangayId);
    proposals.push({
      id,
      title: text(row.title) ?? "Untitled proposal",
      status: text(row.status) ?? "draft",
      partnerId,
      partnerName: partnerId ? partners.get(partnerId)?.name ?? null : null,
      barangayId,
      barangayName: barangayId ? barangays.get(barangayId) ?? null : null,
      startsOn: text(row.startsOn),
      endsOn: text(row.endsOn),
      cashTotal: amount(budget.cashTotal),
      inKindTotal: amount(budget.inKindTotal),
      sdgs: (sdgsByProposal.get(id) ?? []).sort((a, b) => a - b),
      rowVersion: typeof row.rowVersion === "number" ? row.rowVersion : 1,
      createdAt: text(own.created_at),
      updatedAt: text(own.updated_at),
      // The latest submission, so a resubmitted proposal shows its newest date.
      submittedAt: text(submits[0]?.occurred_at),
      latestRemark: remark ? { text: String(remark.remarks), action: String(remark.action), occurredAt: String(remark.occurred_at) } : null,
    });
  }

  const titles = new Map(proposals.map((row) => [row.id, row.title]));
  const activity: ContributorActivity[] = events
    .filter((event) => titles.has(String(event.proposal_id)))
    .slice(0, 8)
    .map((event) => ({
      proposalId: String(event.proposal_id),
      title: titles.get(String(event.proposal_id)) ?? "Proposal",
      action: String(event.action),
      toStatus: text(event.to_status),
      remarks: text(event.remarks),
      occurredAt: String(event.occurred_at),
    }));

  return {
    contributor: sources.contributor,
    organizations: sources.organizationIds.flatMap((id) => {
      const partner = partners.get(id);
      return partner ? [{ id, name: partner.name, type: partner.type }] : [];
    }),
    proposals,
    activity,
  };
}
