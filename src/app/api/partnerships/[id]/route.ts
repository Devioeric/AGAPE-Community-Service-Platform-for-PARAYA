import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { guardV1Mutation } from "@/lib/phase2/feature";
import { createAdminClient } from "@/lib/supabase/admin";
import { partnershipDto, partnershipWriteSchema, type PartnershipRow } from "@/lib/partnerships/contracts";

type Ctx = { params: Promise<{ id: string }> };
const SELECT_FIELDS = "id,name,municipality,province,contact_person,contact_phone,contact_email,total_population,total_households,partnership_start,latitude,longitude,is_active,created_at,updated_at";

function scoped(auth: { actor: { role: string; barangayId: string | null } }, id: string) {
  return !auth.actor.role.startsWith("barangay_") || (Boolean(auth.actor.barangayId) && auth.actor.barangayId === id);
}

export async function GET(_request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("partnership.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  if (!scoped(auth, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const [{ data, error }, { data: history, error: historyError }] = await Promise.all([
    admin.from("barangays").select(SELECT_FIELDS).eq("id", id).single(),
    admin.from("partnership_history").select("id,event_type,notes,date,created_at").eq("barangay_id", id).order("date", { ascending: false }),
  ]);
  if (error || historyError) return NextResponse.json({ error: error?.message ?? historyError?.message }, { status: 500 });
  return NextResponse.json({ data: { ...partnershipDto(data as PartnershipRow), partnership_history: history ?? [] } });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("partnership.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const retired = await guardV1Mutation("partners", auth.supabase);
  if (retired) return retired;
  const { id } = await params;
  const parsed = partnershipWriteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  const { data, error } = await createAdminClient().from("barangays").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", id).select(SELECT_FIELDS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: partnershipDto(data as PartnershipRow) });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("partnership.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const retired = await guardV1Mutation("partners", auth.supabase);
  if (retired) return retired;
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin.from("barangays").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id).eq("is_active", true).select("id,name").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Partnership is already inactive or missing" }, { status: 409 });
  await admin.from("partnership_history").insert({ barangay_id: id, officer_id: auth.actor.id, event_type: "Partnership Deactivated", notes: "Barangay marked as inactive.", date: new Date().toISOString().slice(0, 10) });
  return NextResponse.json({ success: true });
}
