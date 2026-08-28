import { NextRequest, NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { deliveryRuntimeSchema, deliveryRuntimeUpdateSchema } from "@/lib/reporting/contracts";

export async function GET() {
  const auth = await authorizeCapability("communication.provider.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase6_get_delivery_runtime");
  if (error) return NextResponse.json({ error: "Unable to load delivery runtime" }, { status: 500 });
  return NextResponse.json((data ?? []).map((row: unknown) => deliveryRuntimeSchema.parse(row)));
}

export async function PUT(request: NextRequest) {
  const auth = await authorizeCapability("communication.provider.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = deliveryRuntimeUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid delivery configuration" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase6_configure_delivery", {
    p_channel: parsed.data.channel,
    p_mode: parsed.data.mode,
    p_provider_key: parsed.data.providerKey,
    p_synthetic_user_ids: parsed.data.syntheticUserIds,
  });
  if (error) return NextResponse.json({ error: "Unable to update delivery runtime" }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const auth = await authorizeCapability("communication.provider.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = deliveryRuntimeUpdateSchema.pick({ channel: true }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase6_requeue_suppressed_deliveries", { p_channel: parsed.data.channel, p_limit: 100 });
  if (error) return NextResponse.json({ error: "Unable to requeue deliveries" }, { status: 400 });
  return NextResponse.json({ requeued: data });
}
