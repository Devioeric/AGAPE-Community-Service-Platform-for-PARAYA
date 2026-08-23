import { NextResponse } from "next/server";

/**
 * Community validation is evidence-derived from linked needs/surveys/field
 * observations or documented consultation events. The former manual boolean
 * attestation could bypass that evidence and conflicts with the protected
 * proposal workflow columns, so Phase 0 retires this mutation endpoint.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Manual community-validation attestation is retired. Add approved evidence links or a documented consultation instead.",
      code: "manual_validation_retired",
    },
    { status: 410 },
  );
}
