import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";

/**
 * Plaintext full-database export is disabled during Phase 0. The former route
 * exposed resident/profile content to any Admin and produced an unencrypted
 * browser download. A replacement must be purpose-bound, recently
 * re-authenticated, encrypted, access-audited, and implemented as a managed
 * recovery operation rather than ordinary data browsing.
 */
export async function GET() {
  const auth = await authorizeCapability("admin.recovery.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json(
    {
      error:
        "Full backup export is temporarily disabled pending an encrypted, purpose-bound recovery workflow.",
      code: "backup_export_disabled",
    },
    { status: 503 },
  );
}
