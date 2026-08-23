import { createAdminClient } from "@/lib/supabase/admin";
import { isPartner } from "@/lib/auth/roles";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { parseProgramCreateInput } from "@/lib/programs/mutation-contracts";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await authorizeAnyCapability(["program.read", "legacy_partner.history.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase      = auth.supabase;
  const adminSupabase = createAdminClient();
  const user = { id: auth.actor.id };
  const self = { role: auth.actor.role };

  // Partner accounts only see programs born from proposals they submitted.
  // Resolve their proposal ids first, then filter the program query.
  let ownProposalIds: string[] | null = null;
  if (isPartner(self?.role)) {
    const { data: myProposals } = await adminSupabase
      .from("project_proposals")
      .select("id")
      .eq("created_by", user.id);
    ownProposalIds = (myProposals ?? []).map((p) => p.id);
    // Empty array → no programs match; short-circuit to keep the query simple.
    if (ownProposalIds.length === 0) return NextResponse.json({ data: [] });
  }

  // Use the admin client so the joined `barangays(...)` relation can be read
  // regardless of the caller's role. Without this, RLS on `barangays` silently
  // drops the join (the program comes back with barangays = null even when
  // barangay_id is set), making programs render as "Unassigned" in the UI.
  // Partner scoping is preserved by the `ownProposalIds` filter above.
  let programsQuery = adminSupabase
    .from("programs")
    .select("*, barangays(name, latitude, longitude)")
    .order("start_date", { ascending: false });
  if (ownProposalIds) programsQuery = programsQuery.in("proposal_id", ownProposalIds);

  const [{ data: programs, error }, { data: allSignups }, { data: mySignups }] = await Promise.all([
    programsQuery,
    adminSupabase.from("program_signups").select("program_id, status"),
    supabase.from("program_signups").select("program_id, id, status").eq("volunteer_id", user.id),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isPartner(self?.role)) {
    return NextResponse.json({ data: (programs ?? []).map((program) => ({
      id: program.id, title: program.title, status: program.status,
      start_date: program.start_date, end_date: program.end_date,
    })) });
  }

  const enriched = (programs ?? []).map((p) => ({
    ...p,
    signup_count: (allSignups ?? []).filter((s) => s.program_id === p.id && s.status !== "withdrawn").length,
    my_signup:    (mySignups   ?? []).find((s)  => s.program_id === p.id) ?? null,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("program.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = parseProgramCreateInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Role already verified above. Use admin client so the insert isn't blocked
  // by RLS policies that pre-date the role expansion (R-1).
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("programs")
    .insert({ ...parsed.data, created_by: auth.actor.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
