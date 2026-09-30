import { NextResponse } from "next/server";

/**
 * Mother Leaders may contribute offline but no longer have AGAPE accounts or
 * system assignments. Keep the old URL fail-closed for stale clients.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Mother Leader system assignments have been retired.",
      code: "mother_leader_assignments_retired",
    },
    { status: 410 },
  );
}
