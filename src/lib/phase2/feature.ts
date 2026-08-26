import { NextResponse } from "next/server";
import type { Capability } from "@/lib/auth/capabilities";

export type Phase2Component = "partners" | "historical_programs" | "proposals" | "program_finance" | "external_contact_email";

const ENV_BY_COMPONENT: Record<Phase2Component, string> = {
  partners: "AGAPE_PARTNER_REGISTRY_V2_ENABLED",
  historical_programs: "AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED",
  proposals: "AGAPE_PROPOSALS_V2_ENABLED",
  program_finance: "AGAPE_PROGRAM_FINANCE_V2_ENABLED",
  external_contact_email: "AGAPE_EXTERNAL_CONTACT_EMAIL_ENABLED",
};

export const PHASE2_COMPONENT_MANAGE_CAPABILITY: Record<Phase2Component, Capability> = {
  partners: "partner.policy.manage",
  historical_programs: "historical_program.review",
  proposals: "proposal.catalog.manage",
  program_finance: "budget.category.manage",
  external_contact_email: "partner.policy.manage",
};

export function isPhase2ComponentEnabled(component: Phase2Component): boolean {
  return process.env[ENV_BY_COMPONENT[component]] === "true";
}

export function phase2DisabledResponse(component: Phase2Component) {
  return NextResponse.json(
    {
      error: `Phase 2 component ${component} is disabled until its release gates pass`,
      code: "phase2_component_disabled",
      component,
    },
    { status: 503 },
  );
}

export function phase2RpcError(error: { message?: string; code?: string } | null) {
  const status = error?.code === "42501" ? 403
    : error?.code === "P0002" ? 404
      : error?.code === "40001" || error?.code === "23505" ? 409
        : error?.code === "22023" || error?.code === "23514" ? 422
          : 500;
  return NextResponse.json({ error: error?.message ?? "Phase 2 operation failed" }, { status });
}

type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> };

/**
 * V1 remains writable until a reconciled database cutover names V2 as the
 * authority. Once the server flag is on, a missing/unreadable cutover record
 * fails closed so V1 and V2 cannot mutate independent state machines.
 */
export async function guardV1Mutation(component: "partners" | "proposals", client: RpcClient): Promise<NextResponse | null> {
  const phase2Component: Phase2Component = component === "partners" ? "partners" : "proposals";
  if (!isPhase2ComponentEnabled(phase2Component)) return null;
  const { data, error } = await client.rpc("phase2_v1_writes_allowed", { p_component: component });
  if (error) return NextResponse.json({ error: "V1/V2 cutover state is unavailable" }, { status: 503 });
  if (data !== true) return NextResponse.json({ error: "This V1 mutation endpoint was retired after the V2 cutover", code: "v1_mutation_retired" }, { status: 410 });
  return null;
}
