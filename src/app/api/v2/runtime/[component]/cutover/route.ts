import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { phase2RpcError } from "@/lib/phase2/feature";

const componentSchema = z.enum(["partners", "proposals"]);
const bodySchema = z.strictObject({ authority: z.enum(["v1", "v2"]), reconciliationHash: z.string().regex(/^[0-9a-f]{64}$/) });

export async function POST(request: Request, { params }: { params: { component: string } }) {
  const auth = await authorizeCapability("partner.policy.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const component = componentSchema.safeParse(params.component);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!component.success || !body.success) return NextResponse.json({ error: "Invalid cutover request" }, { status: 400 });
  const { error } = await auth.supabase.rpc("phase2_set_cutover_authority", { p_component: component.data,
    p_authority: body.data.authority, p_reconciliation_hash: body.data.reconciliationHash });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { component: component.data, authority: body.data.authority } });
}
