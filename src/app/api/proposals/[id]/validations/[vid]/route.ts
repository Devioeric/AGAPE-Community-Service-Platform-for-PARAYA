import { NextResponse } from "next/server";

export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Community-validation events are retained as evidence. Archival and correction history will replace hard deletion.",
      code: "validation_delete_disabled",
    },
    { status: 405 },
  );
}
