import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Institutional organizations are migration-only identities during the
 * reduced-account transition and must not receive volunteer PII. Future
 * Partner/Proponent records are non-login records managed by PARAYA.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error:
        "The partner volunteer roster is retired under the reduced-account scope.",
      code: "partner_roster_retired",
    },
    { status: 410 },
  );
}
