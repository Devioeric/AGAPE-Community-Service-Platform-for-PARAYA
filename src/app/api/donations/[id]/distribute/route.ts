import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { donationDistributionSchema } from "@/lib/domain/phase1-contracts";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("donation.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = donationDistributionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_record_donation_distribution", { p_donation_id: id, p_payload: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 422 });
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
export async function DELETE() { return NextResponse.json({ error: "Distribution deletion is disabled. Use an audited void correction." }, { status: 405, headers: { Allow: "POST" } }); }
