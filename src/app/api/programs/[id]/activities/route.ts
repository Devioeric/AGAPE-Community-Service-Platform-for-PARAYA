import { authorizeCapability } from "@/lib/auth/authorize";
import { parseProgramActivityCreateInput } from "@/lib/programs/mutation-contracts";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = parseProgramActivityCreateInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("program_activities")
    .insert({
      ...parsed.data,
      program_id: id,
      created_by: auth.actor.id,
      approval_status: "approved",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
