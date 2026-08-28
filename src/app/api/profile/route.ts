import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(2).max(150).optional(),
  phone: z.union([z.string().trim().regex(/^(\+?63|0)9\d{9}$/), z.literal(""), z.null()]).optional(),
  notification_prefs: z.object({
    in_app: z.boolean().optional(),
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
  }).strict().optional(),
}).strict();

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

  const parsed = profileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile update" }, { status: 400 });
  const body = parsed.data;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.full_name !== undefined) {
    updates.full_name = body.full_name;
  }

  if (body.phone !== undefined) {
    const phone = (body.phone ?? "").trim();
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
