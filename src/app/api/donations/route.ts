import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { donationInputSchema } from "@/lib/domain/phase1-contracts";

export async function GET() {
  const auth = await authorizeCapability("donation.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.from("donations").select("*, programs(title), barangays(name), donation_distributions(quantity, voided_at)").is("archived_at", null).is("donation_distributions.voided_at", null).order("received_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("donation.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = donationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_save_donation", { p_donation_id: null, p_payload: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 422 });
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
