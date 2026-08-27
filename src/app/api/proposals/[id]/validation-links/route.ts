import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const LINKABLE_SOURCE_TYPES = [
  "community_need", "survey", "field_observation", "profiling_evidence_snapshot",
] as const;
type SourceType = (typeof LINKABLE_SOURCE_TYPES)[number] | "survey_response" | "household_profile";

const proposalIdSchema = z.string().uuid();
const createLinkSchema = z.object({
  source_type: z.enum(LINKABLE_SOURCE_TYPES),
  source_id: z.string().uuid(),
  rationale: z.string().trim().min(10).max(2_000),
}).strict();

const LINKABLE_PROPOSAL_STATUSES = ["draft", "submitted", "revisions_requested"] as const;

// ── GET: list all links for a proposal, with the referenced records' details ─
export async function GET(_req: Request, { params }: Ctx) {
  const { id }   = await params;
  const auth = await authorizeCapability("proposal.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!proposalIdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid proposal id" }, { status: 400 });

  const admin = createAdminClient();
  const { data: links, error } = await admin
    .from("proposal_validation_links")
    .select("id, source_type, source_id, provenance_kind, rationale, linked_by, created_at, users:linked_by(full_name)")
    .eq("proposal_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Proposal validation links could not be loaded", { proposalId: id, code: error.code });
    return NextResponse.json({ error: "Proposal validation links could not be loaded" }, { status: 500 });
  }
  if (!links || links.length === 0) return NextResponse.json({ data: [] });

  // Bucket source IDs by type so we can hydrate each set with one query.
  const byType: Record<SourceType, string[]> = {
    community_need:     [],
    survey:             [],
    survey_response:    [],
    field_observation:  [],
    household_profile:  [],
    profiling_evidence_snapshot: [],
  };
  for (const l of links) {
    byType[l.source_type as SourceType].push(l.source_id as string);
  }

  // Parallel hydrate
  const [needs, surveys, responses, observations, households, evidence] = await Promise.all([
    byType.community_need.length === 0 ? Promise.resolve({ data: [] as Record<string, unknown>[] }) :
      admin.from("community_needs")
        .select("id, title, category, approval_status, sitio, barangays(name)")
        .in("id", byType.community_need),
    byType.survey.length === 0 ? Promise.resolve({ data: [] as Record<string, unknown>[] }) :
      admin.from("surveys")
        .select("id, title, status, barangays(name)")
        .in("id", byType.survey),
    byType.survey_response.length === 0 ? Promise.resolve({ data: [] as Record<string, unknown>[] }) :
      admin.from("survey_responses")
        .select("id, survey_id, surveys(title)")
        .in("id", byType.survey_response),
    byType.field_observation.length === 0 ? Promise.resolve({ data: [] as Record<string, unknown>[] }) :
      admin.from("field_observations")
        .select("id, observation, sitio, observation_date, category, barangays(name)")
        .in("id", byType.field_observation),
    byType.household_profile.length === 0 ? Promise.resolve({ data: [] as Record<string, unknown>[] }) :
      admin.from("household_profiles")
        .select("id, household_number, sitio, barangays(name)")
        .in("id", byType.household_profile),
    byType.profiling_evidence_snapshot.length === 0 ? Promise.resolve({ data: [] as Record<string, unknown>[] }) :
      admin.from("profiling_evidence_snapshots")
        .select("id, cycle_id, aggregate_schema_version, generated_at, content_hash, profiling_cycles(name, barangays(name))")
        .in("id", byType.profiling_evidence_snapshot),
  ]);

  const indexer = <T extends { id?: unknown }>(rows: T[] | null | undefined) => {
    const m = new Map<string, T>();
    for (const r of rows ?? []) if (r?.id) m.set(r.id as string, r);
    return m;
  };
  const needsMap   = indexer(needs.data        as { id?: unknown }[]);
  const surveysMap = indexer(surveys.data      as { id?: unknown }[]);
  const respMap    = indexer(responses.data    as { id?: unknown }[]);
  const obsMap     = indexer(observations.data as { id?: unknown }[]);
  const hpMap      = indexer(households.data   as { id?: unknown }[]);
  const evidenceMap = indexer(evidence.data as { id?: unknown }[]);

  const enriched = links.map((l) => {
    const sid = l.source_id as string;
    let details: Record<string, unknown> | null = null;
    switch (l.source_type) {
      case "community_need":    details = needsMap.get(sid)   ?? null; break;
      case "survey":            details = surveysMap.get(sid) ?? null; break;
      case "survey_response":   details = respMap.get(sid)    ?? null; break;
      case "field_observation": details = obsMap.get(sid)     ?? null; break;
      case "household_profile": details = hpMap.get(sid)      ?? null; break;
      case "profiling_evidence_snapshot": details = evidenceMap.get(sid) ?? null; break;
    }
    return {
      id:          l.id,
      source_type: l.source_type,
      source_id:   l.source_id,
      provenance_kind: l.provenance_kind,
      rationale:   l.rationale,
      linked_by:   l.linked_by,
      linker_name: (l.users as unknown as { full_name?: string | null } | null)?.full_name ?? null,
      created_at:  l.created_at,
      details,
    };
  });

  return NextResponse.json({ data: enriched });
}

// ── POST: create a link ─────────────────────────────────────────────────────
// Body: { source_type, source_id, rationale }
export async function POST(request: Request, { params }: Ctx) {
  const { id }   = await params;
  const auth = await authorizeCapability("proposal.review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!proposalIdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid proposal id" }, { status: 400 });

  const parsed = createLinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid validation-link request" }, { status: 400 });
  const body = parsed.data;

  const admin = createAdminClient();
  const { data: proposal, error: proposalError } = await admin.from("project_proposals")
    .select("id,barangay_id,status")
    .eq("id", id)
    .maybeSingle();
  if (proposalError) return NextResponse.json({ error: "Proposal validation context could not be loaded" }, { status: 500 });
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (!proposal.barangay_id || !(LINKABLE_PROPOSAL_STATUSES as readonly string[]).includes(proposal.status)) {
    return NextResponse.json({ error: "Evidence can only be linked to an editable barangay proposal" }, { status: 409 });
  }

  let sourceIsValid = false;
  if (body.source_type === "community_need") {
    const { data: need, error } = await admin.from("community_needs")
      .select("id,barangay_id,approval_status")
      .eq("id", body.source_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Validation source could not be verified" }, { status: 500 });
    sourceIsValid = Boolean(need && need.approval_status === "approved" && need.barangay_id === proposal.barangay_id);
  } else if (body.source_type === "survey") {
    const { data: survey, error } = await admin.from("surveys")
      .select("id,target_barangay_id,status")
      .eq("id", body.source_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Validation source could not be verified" }, { status: 500 });
    sourceIsValid = Boolean(survey && ["published", "closed"].includes(survey.status) && survey.target_barangay_id === proposal.barangay_id);
  } else if (body.source_type === "field_observation") {
    const { data: observation, error } = await admin.from("field_observations")
      .select("id,barangay_id")
      .eq("id", body.source_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Validation source could not be verified" }, { status: 500 });
    sourceIsValid = Boolean(observation && observation.barangay_id === proposal.barangay_id);
  } else {
    const { data: snapshot, error: snapshotError } = await admin.from("profiling_evidence_snapshots")
      .select("id,cycle_id,aggregate_schema_version")
      .eq("id", body.source_id)
      .maybeSingle();
    if (snapshotError) return NextResponse.json({ error: "Validation source could not be verified" }, { status: 500 });
    const cycleResult = snapshot
      ? await admin.from("profiling_cycles").select("id,barangay_id,status").eq("id", snapshot.cycle_id).maybeSingle()
      : { data: null, error: null };
    if (cycleResult.error) return NextResponse.json({ error: "Validation source could not be verified" }, { status: 500 });
    sourceIsValid = Boolean(
      snapshot
      && snapshot.aggregate_schema_version === "agape.profiling.aggregate.v2"
      && cycleResult.data
      && ["completed", "archived"].includes(cycleResult.data.status)
      && cycleResult.data.barangay_id === proposal.barangay_id
    );
  }
  if (!sourceIsValid) return NextResponse.json({ error: "Only an eligible source from the proposal barangay may be linked" }, { status: 422 });

  const { data, error } = await admin
    .from("proposal_validation_links")
    .insert({
      proposal_id: id,
      source_type: body.source_type,
      source_id:   body.source_id,
      provenance_kind: "validation",
      rationale:   body.rationale,
      linked_by:   auth.actor.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This record is already linked to the proposal." },
        { status: 409 }
      );
    }
    console.error("Proposal validation link creation failed", { proposalId: id, code: error.code });
    return NextResponse.json({ error: "The validation link could not be created" }, { status: 500 });
  }
  return NextResponse.json({ data: { id: data.id } }, { status: 201 });
}
