import { NextResponse } from "next/server";

/**
 * Compatibility endpoint for stale clients. Captain endorsement was
 * superseded by independent Researcher validation and optional Secretary
 * acknowledgment. Historical endorsement rows remain readable, but this
 * endpoint can no longer create one.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Captain profiling endorsement has been retired.",
      code: "profiling_endorse_retired",
    },
    { status: 410 },
  );
}
