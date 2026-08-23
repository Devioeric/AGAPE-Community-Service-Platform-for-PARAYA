import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { parseProgramUpdateInput } from "@/lib/programs/mutation-contracts";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = auth.supabase;
  const adminSupabase = createAdminClient();
  const { id } = await params;
  const includeVolunteerPii = hasCapability(auth.actor.role, auth.actor.permissions, "volunteer.directory.read");

  const [{ data: program, error }, { data: activities }, { data: budgets }, { data: signups }] =
    await Promise.all([
      supabase
        .from("programs")
        .select("*, barangays(name)")
        .eq("id", id)
        .single(),
      supabase
        .from("program_activities")
        .select("*, activity_photos(count)")
        .eq("program_id", id)
        .order("date", { ascending: true }),
      // program_budgets has no `created_at` column (only `updated_at` per the
      // production schema). Ordering by a missing column would silently return
      // no rows, leaving the Budget tab showing "0 items". Use admin client
      // too so the read isn't blocked by RLS that may not yet cover the
      // expanded role set.
      adminSupabase
        .from("program_budgets")
        .select("*")
        .eq("program_id", id)
        .order("updated_at", { ascending: true }),
      includeVolunteerPii
        ? adminSupabase
            .from("program_signups")
            .select("*, users!volunteer_id(full_name, email)")
            .eq("program_id", id)
            .neq("status", "withdrawn")
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten activity_photos(count) into a plain photo_count number per activity
  // so the client doesn't need to know about the aggregate-shape quirk.
  type ActivityWithPhotos = { activity_photos?: { count: number }[] | { count: number } | null } & Record<string, unknown>;
  const activitiesOut = (activities ?? []).map((a) => {
    const ap = (a as ActivityWithPhotos).activity_photos;
    const photo_count = Array.isArray(ap) ? (ap[0]?.count ?? 0) : (ap?.count ?? 0);
    const { activity_photos: _, ...rest } = a as ActivityWithPhotos;
    void _;
    return { ...rest, photo_count };
  });

  return NextResponse.json({
    data: {
      ...program,
      activities: activitiesOut,
      budgets:    budgets    ?? [],
      signups:    signups    ?? [],
    },
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = auth.supabase;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = parseProgramUpdateInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("programs")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "program_delete_disabled",
      message: "Program history is retained. Set the program lifecycle status to cancelled instead.",
    },
    { status: 405 },
  );
}
