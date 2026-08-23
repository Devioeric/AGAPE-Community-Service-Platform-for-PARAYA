import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json() as {
    subject?:     string;
    day_of_week?: number;
    start_time?:  string;
    end_time?:    string;
    location?:    string | null;
    notes?:       string | null;
  };

  if (body.day_of_week !== undefined && (body.day_of_week < 0 || body.day_of_week > 6)) {
    return NextResponse.json({ error: "Invalid day of week" }, { status: 400 });
  }
  if (body.subject !== undefined && body.subject.trim().length === 0) {
    return NextResponse.json({ error: "Subject cannot be empty" }, { status: 400 });
  }
  if (body.start_time && body.end_time && body.end_time <= body.start_time) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.subject     !== undefined) updates.subject     = body.subject.trim();
  if (body.day_of_week !== undefined) updates.day_of_week = body.day_of_week;
  if (body.start_time  !== undefined) updates.start_time  = body.start_time;
  if (body.end_time    !== undefined) updates.end_time    = body.end_time;
  if (body.location    !== undefined) updates.location    = body.location?.trim() || null;
  if (body.notes       !== undefined) updates.notes       = body.notes?.trim()    || null;

  const { error } = await supabase
    .from("volunteer_class_schedules")
    .update(updates)
    .eq("id", id)
    .eq("volunteer_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase
    .from("volunteer_class_schedules")
    .delete()
    .eq("id", id)
    .eq("volunteer_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
