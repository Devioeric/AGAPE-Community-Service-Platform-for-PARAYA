import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseProgramActivityCreateInput } from "@/lib/programs/mutation-contracts";
import { programMutationError } from "@/lib/programs/completion-contract";
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

  // Keep direct table writes denied by RLS; authorized server routes use the
  // server-only client after validating the actor and payload.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("program_activities")
    .insert({
      ...parsed.data,
      program_id: id,
      created_by: auth.actor.id,
      approval_status: "approved",
    })
    .select()
    .single();

  if (error) {
    const failure = programMutationError(error);
    return NextResponse.json({ error: failure.error, code: failure.code }, { status: failure.status });
  }
  return NextResponse.json({ data }, { status: 201 });
}
