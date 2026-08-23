import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2RpcError, type Phase2Component } from "@/lib/phase2/feature";

const componentSchema = z.enum(["partners", "historical_programs", "proposals", "program_finance", "external_contact_email"]);
const bodySchema = z.strictObject({ mode: z.enum(["off", "synthetic", "live"]), syntheticUserIds: z.array(z.string().uuid()).default([]), syntheticEntityIds: z.array(z.string().uuid()).default([]), implementationDate: z.string().date().nullable().optional(), configuration: z.record(z.string(), z.unknown()).default({}) });

async function authorizeRuntime() {
  return authorizeAnyCapability(["partner.policy.manage", "historical_program.review"]);
}

export async function GET(_request: Request, { params }: { params: { component: string } }) {
  const component = componentSchema.safeParse(params.component);
  if (!component.success) return NextResponse.json({ error: "Unknown component" }, { status: 404 });
  const auth = await authorizeRuntime();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase2_get_readiness", { p_component: component.data });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { ...(data as Record<string, unknown>), serverEnabled: isPhase2ComponentEnabled(component.data as Phase2Component) } });
}

export async function PUT(request: Request, { params }: { params: { component: string } }) {
  const component = componentSchema.safeParse(params.component);
  if (!component.success) return NextResponse.json({ error: "Unknown component" }, { status: 404 });
  const auth = await authorizeRuntime();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid runtime configuration", issues: body.error.issues }, { status: 400 });
  // Operators can always force a component off. Leaving off also requires the
  // independent server gate, preventing an accidental database-only launch.
  if (body.data.mode !== "off" && !isPhase2ComponentEnabled(component.data as Phase2Component)) {
    return NextResponse.json({ error: "Server component gate is disabled" }, { status: 503 });
  }
  const { error } = await auth.supabase.rpc("phase2_configure_component", {
    p_component: component.data, p_mode: body.data.mode, p_synthetic_user_ids: body.data.syntheticUserIds,
    p_synthetic_entity_ids: body.data.syntheticEntityIds, p_implementation_date: body.data.implementationDate ?? null,
    p_configuration: body.data.configuration,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { component: component.data, mode: body.data.mode } });
}
