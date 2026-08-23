import { z } from "zod";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { NextResponse } from "next/server";

const createSchema = z.object({
  program_id: z.string().uuid().nullable().optional(),
  date: z.string().date(),
  hours: z.number().positive().max(24),
  description: z.string().trim().min(3).max(2_000),
}).strict();

export async function GET() {
  const auth = await authorizeAnyCapability(["activity_log.self", "activity_log.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const canManage = hasCapability(auth.actor.role, auth.actor.permissions, "activity_log.manage");

  let query = auth.supabase
    .from("activity_logs")
    .select("id, volunteer_id, program_id, date, hours, description, status, reviewed_by, created_at, updated_at, programs(title)")
    .order("date", { ascending: false });

  if (!canManage) query = query.eq("volunteer_id", auth.actor.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("activity_log.self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid activity log" }, { status: 400 });
  const { data, error } = await auth.supabase
    .from("activity_logs")
    .insert({
      volunteer_id: auth.actor.id,
      program_id:   parsed.data.program_id ?? null,
      date:         parsed.data.date,
      hours:        parsed.data.hours,
      description:  parsed.data.description,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
