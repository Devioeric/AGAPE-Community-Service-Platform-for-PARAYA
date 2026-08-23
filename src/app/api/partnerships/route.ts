import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { guardV1Mutation } from "@/lib/phase2/feature";
import { createAdminClient } from "@/lib/supabase/admin";
import { partnershipDto, partnershipWriteSchema, type PartnershipRow } from "@/lib/partnerships/contracts";

const SELECT_FIELDS = "id,name,municipality,province,contact_person,contact_phone,contact_email,total_population,total_households,partnership_start,latitude,longitude,is_active,created_at,updated_at";

export async function GET() {
  const auth = await authorizeCapability("partnership.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let query = createAdminClient().from("barangays").select(SELECT_FIELDS).order("name", { ascending: true });
  if (auth.actor.role.startsWith("barangay_")) {
    if (!auth.actor.barangayId) return NextResponse.json({ error: "No barangay is assigned" }, { status: 403 });
    query = query.eq("id", auth.actor.barangayId);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data as PartnershipRow[]).map(partnershipDto) });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("partnership.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const retired = await guardV1Mutation("partners", auth.supabase);
  if (retired) return retired;
  const parsed = partnershipWriteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("barangays").insert({ ...parsed.data, is_active: true }).select(SELECT_FIELDS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("partnership_history").insert({ barangay_id: data.id, officer_id: auth.actor.id, event_type: "Partnership Started", notes: `Barangay ${data.name} added to the directory.`, date: new Date().toISOString().slice(0, 10) });
  return NextResponse.json({ data: partnershipDto(data as PartnershipRow) }, { status: 201 });
}
