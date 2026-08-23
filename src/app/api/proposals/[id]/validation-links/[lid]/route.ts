import { NextResponse } from "next/server";

export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Proposal evidence links are retained for traceability. Archival and correction history will replace hard deletion.",
      code: "validation_link_delete_disabled",
    },
    { status: 405 },
  );
}
