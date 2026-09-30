import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseProgramBudgetCreateInput } from "@/lib/programs/mutation-contracts";
import { programMutationError } from "@/lib/programs/completion-contract";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = parseProgramBudgetCreateInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // The database intentionally denies direct authenticated writes by the
  // consolidated Officer role. The route has already performed the active
  // account/capability check above, so use the server-only client for this
  // validated mutation rather than weakening RLS.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("program_budgets")
    .insert({ ...parsed.data, program_id: id, created_by: auth.actor.id, approval_status: "approved" })
    .select()
    .single();

  if (error) {
    const failure = programMutationError(error);
    return NextResponse.json({ error: failure.error, code: failure.code }, { status: failure.status });
  }
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "program_budget_delete_disabled",
      message: "Budget history is retained. Use a revision or zero-value correction instead.",
    },
    { status: 405 },
  );
}
