import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/notifications/email";
import { isPhase2ComponentEnabled } from "@/lib/phase2/feature";
import { createAdminClient } from "@/lib/supabase/admin";

type ClaimedDelivery = {
  id: string;
  claimToken: string;
  templateKey: "partnership_renewal";
  templateVersion: number;
  payload: { partner_name?: unknown; expires_on?: unknown; days?: unknown };
  attemptNumber: number;
  contactEmail: string;
};

function deliveryErrorCode(error: string | undefined) {
  const status = error?.match(/HTTP\s+(\d{3})/i)?.[1];
  return status ? `provider_http_${status}` : error?.includes("not configured") ? "provider_not_configured" : "provider_network_error";
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPhase2ComponentEnabled("partners") || !isPhase2ComponentEnabled("external_contact_email")) {
    return NextResponse.json({ data: { skipped: true, reason: "external_contact_email_disabled" } });
  }

  const admin = createAdminClient();
  const claim = await admin.rpc("phase2_claim_contact_email_outbox", { p_limit: 25, p_lease_seconds: 300 });
  if (claim.error) return NextResponse.json({ error: "Unable to claim contact-email deliveries" }, { status: 500 });
  const deliveries = (claim.data ?? []) as ClaimedDelivery[];
  let sent = 0; let failed = 0; let finalizeFailures = 0;

  for (const delivery of deliveries) {
    if (delivery.templateKey !== "partnership_renewal" || delivery.templateVersion !== 1) {
      const finalized = await admin.rpc("phase2_finalize_contact_email", {
        p_outbox_id: delivery.id, p_claim_token: delivery.claimToken, p_outcome: "cancelled", p_error_code: "unsupported_template",
      });
      if (finalized.error) finalizeFailures += 1;
      else failed += 1;
      continue;
    }
    const partnerName = typeof delivery.payload.partner_name === "string" ? delivery.payload.partner_name : "Partner relationship";
    const expiresOn = typeof delivery.payload.expires_on === "string" ? delivery.payload.expires_on : "the recorded date";
    const days = typeof delivery.payload.days === "number" ? delivery.payload.days : "several";
    const result = await sendEmail({
      to: delivery.contactEmail,
      subject: "[AGAPE] Partnership renewal reminder",
      text: `${partnerName} has a recorded agreement expiration on ${expiresOn} (${days} days remaining). Please coordinate directly with your PARAYA contact. No login or tracking link is required.`,
    });
    const finalized = await admin.rpc("phase2_finalize_contact_email", {
      p_outbox_id: delivery.id,
      p_claim_token: delivery.claimToken,
      p_outcome: result.sent ? "sent" : "retry",
      p_error_code: result.sent ? null : deliveryErrorCode(result.error),
    });
    if (finalized.error) finalizeFailures += 1;
    else if (result.sent) sent += 1;
    else failed += 1;
  }

  if (finalizeFailures > 0) {
    return NextResponse.json({ error: "One or more delivery results could not be finalized", data: { claimed: deliveries.length, sent, failed, finalizeFailures } }, { status: 500 });
  }
  return NextResponse.json({ data: { claimed: deliveries.length, sent, failed, finalizeFailures: 0 } });
}

export const GET = POST;
