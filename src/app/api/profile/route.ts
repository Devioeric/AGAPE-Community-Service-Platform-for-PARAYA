import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("users")
    .select("full_name, email, role, phone, notification_prefs")
    .eq("id", user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    full_name?:          string;
    phone?:              string | null;
    notification_prefs?: { in_app?: boolean; email?: boolean; sms?: boolean };
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.full_name !== undefined) {
    const name = body.full_name.trim();
    if (name.length < 2) {
      return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
    }
    updates.full_name = name;
  }

  if (body.phone !== undefined) {
    const phone = (body.phone ?? "").trim();
    // Accept Philippine mobile numbers in common forms (or empty to clear).
    if (phone && !/^(\+?63|0)9\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: "Phone must be a valid PH mobile number (09xxxxxxxxx or +639xxxxxxxxx)" },
        { status: 400 }
      );
    }
    updates.phone = phone || null;
  }

  if (body.notification_prefs !== undefined) {
    const p = body.notification_prefs;
    updates.notification_prefs = {
      in_app: p.in_app !== false,   // default on
      email:  p.email  !== false,   // default on
      sms:    p.sms    === true,    // default off
    };
  }

  const { error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
