import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isNotificationDeliveryEnabled } from "@/lib/reporting/feature";
import { deliverNotification } from "@/lib/reporting/provider";
import type { NotificationDeliveryClaim } from "@/lib/reporting/contracts";

export async function POST(request: NextRequest) {
  if (!isNotificationDeliveryEnabled()) return NextResponse.json({ disabled: true, processed: 0 });
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("phase6_claim_notification_deliveries", { p_limit: 20, p_lease_seconds: 300 });
  if (error) return NextResponse.json({ error: "Unable to claim deliveries" }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const claim of (data ?? []) as NotificationDeliveryClaim[]) {
    const result = await deliverNotification(claim);
    const finalized = await admin.rpc("phase6_finalize_notification_delivery", {
      p_outbox_id: claim.id,
      p_claim_token: claim.claimToken,
      p_result: result.ok ? "sent" : "failed",
      p_provider_message_id: result.ok ? result.providerMessageId : null,
      p_error_code: result.ok ? null : result.errorCode,
    });
    if (finalized.error) failed += 1;
    else if (result.ok) sent += 1;
    else failed += 1;
  }
  return NextResponse.json({ processed: (data ?? []).length, sent, failed });
}
