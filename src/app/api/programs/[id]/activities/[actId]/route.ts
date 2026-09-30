import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseProgramActivityUpdateInput } from "@/lib/programs/mutation-contracts";
import { programMutationError } from "@/lib/programs/completion-contract";
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

  // RLS blocks direct Officer table updates by design. This trusted route has
  // already checked program.manage and the strict update contract.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("program_activities")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", actId)
    .eq("program_id", id)
    .select()
    .single();

  if (error) {
    const failure = programMutationError(error);
    return NextResponse.json({ error: failure.error, code: failure.code }, { status: failure.status });
  }
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
