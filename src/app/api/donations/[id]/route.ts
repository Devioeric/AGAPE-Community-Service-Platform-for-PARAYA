import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { donationInputSchema } from "@/lib/domain/phase1-contracts";

type Ctx = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("donation.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await auth.supabase.from("donations").select("*, programs(title), barangays(name), donation_distributions(*)").eq("id", id).is("archived_at", null).is("donation_distributions.voided_at", null).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("donation.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = donationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_save_donation", { p_donation_id: id, p_payload: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 422 });
  return NextResponse.json({ data: { id: data } });
}
export async function DELETE() { return NextResponse.json({ error: "Donation deletion is disabled. Use the audited archive action." }, { status: 405, headers: { Allow: "GET, PATCH" } }); }
