import { NextResponse } from "next/server";

/**
 * Active Mother Leader assignments are closed by the contract migration.
 * Historical assignment rows are preserved and cannot be mutated here.
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
