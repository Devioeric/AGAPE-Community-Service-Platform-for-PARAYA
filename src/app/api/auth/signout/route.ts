import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 0) {
    return NextResponse.json({ error: "Sign-out requests do not accept a body." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) {
    return NextResponse.json({ error: "Sign out failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json(
    { success: true },
    { headers: { "cache-control": "no-store" } }
  );
}
