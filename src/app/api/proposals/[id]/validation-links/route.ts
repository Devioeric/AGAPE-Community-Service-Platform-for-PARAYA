import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

const VALID_SOURCE_TYPES = [
  "community_need", "survey", "survey_response", "field_observation", "profiling_evidence_snapshot",
] as const;
type SourceType = (typeof VALID_SOURCE_TYPES)[number] | "household_profile";

// ── GET: list all links for a proposal, with the referenced records' details ─
export async function GET(_req: Request, { params }: Ctx) {
  const { id }   = await params;
  const auth = await authorizeCapability("proposal.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data: links, error } = await admin
    .from("proposal_validation_links")
    .select("id, source_type, source_id, rationale, linked_by, created_at, users:linked_by(full_name)")
    .eq("proposal_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  const body = await request.json() as {
    source_type?: string;
    source_id?:   string;
    rationale?:   string;
  };

  if (!body.source_type || !(VALID_SOURCE_TYPES as readonly string[]).includes(body.source_type)) {
    return NextResponse.json({ error: "Invalid source_type." }, { status: 400 });
  }
  if (!body.source_id) {
    return NextResponse.json({ error: "source_id is required." }, { status: 400 });
  }
  if (!body.rationale || body.rationale.trim().length < 10) {
    return NextResponse.json(
      { error: "Rationale must explain how this record informed the proposal (min 10 characters)." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (body.source_type === "profiling_evidence_snapshot") {
    const { data: snapshot } = await admin.from("profiling_evidence_snapshots").select("id, aggregate_schema_version, profiling_cycles!inner(status)").eq("id", body.source_id).eq("aggregate_schema_version", "agape.profiling.aggregate.v2").in("profiling_cycles.status", ["completed", "archived"]).maybeSingle();
    if (!snapshot) return NextResponse.json({ error: "Only immutable evidence from a completed profiling cycle may be linked" }, { status: 422 });
  }
  const { data, error } = await admin
    .from("proposal_validation_links")
    .insert({
      proposal_id: id,
      source_type: body.source_type,
      source_id:   body.source_id,
      rationale:   body.rationale.trim(),
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: { id: data.id } }, { status: 201 });
}
