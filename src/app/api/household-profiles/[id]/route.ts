import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";

export async function PATCH() {
  const auth = await authorizeCapability("profiling.collect");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json(
    { error: "Legacy household data is read-only. Create a versioned profiling package instead.", code: "legacy_profile_read_only" },
    { status: 410 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Legacy household records are retained for historical links and cannot be deleted.", code: "household_profile_delete_disabled" },
    { status: 405, headers: { Allow: "" } },
  );
}
