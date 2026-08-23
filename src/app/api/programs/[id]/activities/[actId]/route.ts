import { authorizeCapability } from "@/lib/auth/authorize";
import { parseProgramActivityUpdateInput } from "@/lib/programs/mutation-contracts";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string; actId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, actId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = parseProgramActivityUpdateInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("program_activities")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", actId)
    .eq("program_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "Program activity hard deletion is disabled. Retain the activity history and use an audited lifecycle status.",
    },
    { status: 405, headers: { Allow: "PATCH" } },
  );
}
