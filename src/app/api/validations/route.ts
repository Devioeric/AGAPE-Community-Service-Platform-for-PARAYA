import { NextResponse } from "next/server";

/**
 * The cross-kind validation queue existed for submissions from institutional
 * partner login accounts. Those accounts are now non-login Partner/Proponent
 * records, while PARAYA creates activities and budget lines directly and
 * volunteer self-signups start in a server-safe state. Keep this endpoint
 * explicitly retired so stale clients cannot revive the former approval path.
 */
function retiredValidationQueue() {
  return NextResponse.json(
    {
      error: "legacy_validation_queue_retired",
      message:
        "The former partner-submission validation queue has been retired. Use the proposal workflow and dedicated PARAYA program-management actions.",
    },
    { status: 410 },
  );
}

export async function GET() {
  return retiredValidationQueue();
}

export async function POST() {
  return retiredValidationQueue();
}
