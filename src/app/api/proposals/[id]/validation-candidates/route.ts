import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

const proposalIdSchema = z.string().uuid();
const sourceTypeSchema = z.enum([
  "community_need",
  "survey",
  "field_observation",
  "profiling_evidence_snapshot",
]);
const candidateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(180),
  meta: z.string().max(320),
}).strict();

const EDITABLE_PROPOSAL_STATUSES = ["draft", "submitted", "revisions_requested"] as const;

function text(value: unknown, max: number, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > max ? `${normalized.slice(0, Math.max(0, max - 1))}…` : normalized;
}

function barangayName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return text((value as { name?: unknown }).name, 120);
}

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const auth = await authorizeCapability("proposal.validation.record");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!proposalIdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid proposal id" }, { status: 400 });

  const parsedSource = sourceTypeSchema.safeParse(new URL(request.url).searchParams.get("source_type"));
  if (!parsedSource.success) return NextResponse.json({ error: "Invalid validation source type" }, { status: 400 });

  const admin = createAdminClient();
  const { data: proposal, error: proposalError } = await admin.from("project_proposals")
    .select("id,barangay_id,status")
    .eq("id", id)
    .maybeSingle();
  if (proposalError) return NextResponse.json({ error: "Proposal validation context could not be loaded" }, { status: 500 });
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (!proposal.barangay_id || !(EDITABLE_PROPOSAL_STATUSES as readonly string[]).includes(proposal.status)) {
    return NextResponse.json({ error: "Validation sources are available only for an editable barangay proposal" }, { status: 409 });
  }
  if (auth.actor.role.startsWith("barangay_") && (!auth.actor.barangayId || proposal.barangay_id !== auth.actor.barangayId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let candidates: z.infer<typeof candidateSchema>[] = [];
  let queryError: { code?: string } | null = null;

  if (parsedSource.data === "community_need") {
    const result = await admin.from("community_needs")
      .select("id,title,category,sitio,approval_status,barangays(name)")
      .eq("barangay_id", proposal.barangay_id)
      .eq("approval_status", "approved")
      .order("created_at", { ascending: false })
      .limit(200);
    queryError = result.error;
    candidates = (result.data ?? []).map((row) => ({
      id: row.id,
      label: text(row.title, 180, "Untitled community need"),
      meta: [text(row.category, 60), barangayName(row.barangays), text(row.sitio, 120), "approved"].filter(Boolean).join(" · "),
    }));
  } else if (parsedSource.data === "survey") {
    const result = await admin.from("surveys")
      .select("id,title,status,barangays(name)")
      .eq("target_barangay_id", proposal.barangay_id)
      .in("status", ["published", "closed"])
      .order("created_at", { ascending: false })
      .limit(200);
    queryError = result.error;
    candidates = (result.data ?? []).map((row) => ({
      id: row.id,
      label: text(row.title, 180, "Untitled survey"),
      meta: [text(row.status, 30), barangayName(row.barangays)].filter(Boolean).join(" · "),
    }));
  } else if (parsedSource.data === "field_observation") {
    const result = await admin.from("field_observations")
      .select("id,observation,observation_date,category,sitio")
      .eq("barangay_id", proposal.barangay_id)
      .order("observation_date", { ascending: false })
      .limit(200);
    queryError = result.error;
    candidates = (result.data ?? []).map((row) => ({
      id: row.id,
      label: text(row.observation, 180, "Field observation"),
      meta: [text(row.observation_date, 10), text(row.category, 60), text(row.sitio, 120)].filter(Boolean).join(" · "),
    }));
  } else {
    const result = await admin.from("profiling_evidence_snapshots")
      .select("id,generated_at,aggregate_schema_version,profiling_cycles!inner(name,barangay_id,status,barangays(name))")
      .eq("aggregate_schema_version", "agape.profiling.aggregate.v2")
      .eq("profiling_cycles.barangay_id", proposal.barangay_id)
      .in("profiling_cycles.status", ["completed", "archived"])
      .order("generated_at", { ascending: false })
      .limit(200);
    queryError = result.error;
    candidates = (result.data ?? []).map((row) => {
      const cycle = row.profiling_cycles as unknown as { name?: unknown; barangays?: unknown } | null;
      return {
        id: row.id,
        label: text(cycle?.name, 180, "Completed profiling cycle"),
        meta: [barangayName(cycle?.barangays), text(row.generated_at, 40)].filter(Boolean).join(" · "),
      };
    });
  }

  if (queryError) {
    console.error("Proposal validation candidates could not be loaded", { proposalId: id, sourceType: parsedSource.data, code: queryError.code });
    return NextResponse.json({ error: "Validation candidates could not be loaded" }, { status: 500 });
  }
  const parsedCandidates = z.array(candidateSchema).safeParse(candidates);
  if (!parsedCandidates.success) {
    console.error("Proposal validation candidates returned an invalid shape", { proposalId: id, sourceType: parsedSource.data });
    return NextResponse.json({ error: "Validation candidates returned an invalid result" }, { status: 500 });
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    user_id: auth.actor.id,
    user_email: auth.actor.email,
    action: "proposal.validation_candidates.read",
    resource_type: "project_proposal",
    resource_id: id,
    level: "info",
    metadata: { source_type: parsedSource.data, candidate_count: parsedCandidates.data.length },
  });
  if (auditError) {
    console.error("Proposal validation candidate audit failed", { proposalId: id, sourceType: parsedSource.data, code: auditError.code });
    return NextResponse.json({ error: "Validation candidate access could not be audited" }, { status: 500 });
  }

  return NextResponse.json({ data: parsedCandidates.data });
}
