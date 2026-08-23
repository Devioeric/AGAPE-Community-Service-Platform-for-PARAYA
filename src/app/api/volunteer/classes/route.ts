import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("volunteer_class_schedules")
    .select("*")
    .eq("volunteer_id", user.id)
    .order("day_of_week", { ascending: true })
    .order("start_time",  { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    subject?:     string;
    day_of_week?: number;
    start_time?:  string;
    end_time?:    string;
    location?:    string;
    notes?:       string;
  };

  if (!body.subject || body.subject.trim().length === 0) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }
  if (typeof body.day_of_week !== "number" || body.day_of_week < 0 || body.day_of_week > 6) {
    return NextResponse.json({ error: "Invalid day of week" }, { status: 400 });
  }
  if (!body.start_time || !body.end_time) {
    return NextResponse.json({ error: "Start and end times are required" }, { status: 400 });
  }
  if (body.end_time <= body.start_time) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("volunteer_class_schedules")
    .insert({
      volunteer_id: user.id,
      subject:      body.subject.trim(),
      day_of_week:  body.day_of_week,
      start_time:   body.start_time,
      end_time:     body.end_time,
      location:     body.location?.trim() || null,
      notes:        body.notes?.trim()    || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
