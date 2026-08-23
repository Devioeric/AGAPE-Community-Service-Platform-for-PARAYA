import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/notifications/email";
import { isPhase2ComponentEnabled } from "@/lib/phase2/feature";
import { createAdminClient } from "@/lib/supabase/admin";

type OutboxRow = { id: string; template_key: string; payload: Record<string, unknown>; attempt_count: number; partner_contacts: { email: string | null; status_email_opt_in: boolean; active_until: string | null } | null };

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPhase2ComponentEnabled("partners") || !isPhase2ComponentEnabled("external_contact_email")) return NextResponse.json({ data: { skipped: true, reason: "external_contact_email_disabled" } });
  const admin = createAdminClient();
  const now = new Date();
  const recovered = await admin.from("partner_contact_email_outbox").update({ status: "queued", claimed_at: null, lease_expires_at: null })
    .eq("status", "sending").lt("lease_expires_at", now.toISOString());
  if (recovered.error) return NextResponse.json({ error: "Unable to recover expired delivery leases" }, { status: 500 });
  const { data, error } = await admin.from("partner_contact_email_outbox")
    .select("id,template_key,payload,attempt_count,partner_contacts(email,status_email_opt_in,active_until)")
    .eq("status", "queued").or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`).order("created_at").limit(25);
  if (error) return NextResponse.json({ error: "Unable to load contact outbox" }, { status: 500 });
  let sent = 0; let failed = 0;
  for (const row of (data ?? []) as unknown as OutboxRow[]) {
    const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const claim = await admin.from("partner_contact_email_outbox").update({ status: "sending", claimed_at: now.toISOString(), lease_expires_at: leaseExpiresAt })
      .eq("id", row.id).eq("status", "queued").select("id").maybeSingle();
    if (claim.error || !claim.data) continue;
    const claimEvent = await admin.from("partner_contact_email_events").insert({ outbox_id: row.id, from_status: "queued", to_status: "sending", attempt_number: row.attempt_count + 1 });
    if (claimEvent.error) {
      await admin.from("partner_contact_email_outbox").update({ status: "queued", claimed_at: null, lease_expires_at: null }).eq("id", row.id).eq("status", "sending");
      failed += 1;
      continue;
    }
    const contact = row.partner_contacts;
    if (!contact?.email || !contact.status_email_opt_in || (contact.active_until && contact.active_until < new Date().toISOString().slice(0, 10))) {
      const cancelled = await admin.from("partner_contact_email_outbox").update({ status: "cancelled", last_error: "Contact is not currently opted in", claimed_at: null, lease_expires_at: null }).eq("id", row.id).eq("status", "sending");
      if (!cancelled.error) await admin.from("partner_contact_email_events").insert({ outbox_id: row.id, from_status: "sending", to_status: "cancelled", attempt_number: row.attempt_count + 1, error_code: "contact_not_eligible" });
      continue;
    }
    const partnerName = typeof row.payload.partner_name === "string" ? row.payload.partner_name : "Partner relationship";
    const expiresOn = typeof row.payload.expires_on === "string" ? row.payload.expires_on : "the recorded date";
    const days = typeof row.payload.days === "number" ? row.payload.days : "several";
    const result = await sendEmail({ to: contact.email, subject: "[AGAPE] Partnership renewal reminder", text: `${partnerName} has a recorded agreement expiration on ${expiresOn} (${days} days remaining). Please coordinate directly with your PARAYA contact. No login or tracking link is required.` });
    if (result.sent) {
      const update = await admin.from("partner_contact_email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempt_count: row.attempt_count + 1, last_error: null, claimed_at: null, lease_expires_at: null }).eq("id", row.id).eq("status", "sending");
      if (update.error) { failed += 1; continue; }
      await admin.from("partner_contact_email_events").insert({ outbox_id: row.id, from_status: "sending", to_status: "sent", attempt_number: row.attempt_count + 1 });
      sent += 1;
    } else {
      failed += 1; const attempts = row.attempt_count + 1;
      const nextStatus = attempts >= 5 ? "failed" : "queued";
      const update = await admin.from("partner_contact_email_outbox").update({ status: nextStatus, attempt_count: attempts, next_attempt_at: new Date(Date.now() + Math.min(24, 2 ** attempts) * 60 * 60 * 1000).toISOString(), last_error: result.error ?? "Delivery failed", claimed_at: null, lease_expires_at: null }).eq("id", row.id).eq("status", "sending");
      if (!update.error) await admin.from("partner_contact_email_events").insert({ outbox_id: row.id, from_status: "sending", to_status: nextStatus, attempt_number: attempts, error_code: "delivery_failed" });
    }
  }
  return NextResponse.json({ data: { sent, failed } });
}
export const GET = POST;
