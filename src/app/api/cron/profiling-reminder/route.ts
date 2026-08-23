import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/cron-auth";
import { notify } from "@/lib/notifications/dispatch";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { NextResponse } from "next/server";

// GET /api/cron/profiling-reminder
// Twice-yearly community-profiling cycle reminder (PARAYA Sprint 4 ask).
//
// Logic per partner barangay:
//   - Find the most recent completed normalized profiling cycle.
//   - If older than 180 days (or none exists), the barangay is due for a
//     fresh community profile.
//   - To avoid spamming, skip if we already sent a `reminder` notification
//     about this barangay's profiling cycle in the last 30 days. We detect
//     the prior reminder by an action_url containing the barangay id.
//   - Fan out to every PARAYA Researcher + Director.
//
// Schedule (vercel.json example):
//   { "path": "/api/cron/profiling-reminder", "schedule": "0 8 * * 1" } // Mon 8am
// Authorization: same Bearer <CRON_SECRET> header used by the snapshot cron.

const STALE_DAYS = 180;
const DEDUP_DAYS = 30;
const REMINDER_TYPE = "reminder";

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  if (!isProfilingV2Enabled()) {
    return NextResponse.json({ data: { skipped: true, reason: "profiling_disabled" } });
  }

  const admin = createAdminClient();
  const now   = Date.now();
  const staleCutoff = new Date(now - STALE_DAYS * 86_400_000).toISOString();
  const dedupCutoff = new Date(now - DEDUP_DAYS * 86_400_000).toISOString();

  // Active partner barangays only.
  const { data: barangays, error: brgyErr } = await admin
    .from("barangays")
    .select("id, name")
    .eq("is_active", true);
  if (brgyErr) return NextResponse.json({ error: brgyErr.message }, { status: 500 });

  // Latest profiling date per barangay. Group with a window query is overkill
  // for the size of this dataset — pull recent rows and reduce in JS.
  const { data: profiles, error: profErr } = await admin
    .from("profiling_cycles")
    .select("barangay_id, completed_at")
    .not("completed_at", "is", null)
    .in("status", ["completed", "archived"])
    .order("completed_at", { ascending: false });
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const latestByBarangay = new Map<string, string>();
  for (const row of profiles ?? []) {
    if (!latestByBarangay.has(row.barangay_id)) {
      latestByBarangay.set(row.barangay_id, row.completed_at!);
    }
  }

  // Stale = older than cutoff, or never profiled.
  const stale = (barangays ?? []).filter((b) => {
    const latest = latestByBarangay.get(b.id);
    return !latest || latest < staleCutoff;
  });

  if (stale.length === 0) {
    return NextResponse.json({ success: true, fired: 0, stale: 0, message: "Nothing due." });
  }

  // Recipients: every active Researcher + Director.
  const { data: recipients, error: usersErr } = await admin
    .from("users")
    .select("id")
    .in("role", ["paraya_researcher", "paraya_director"])
    .eq("status", "active");
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
  const recipientIds = (recipients ?? []).map((r) => r.id);

  // Detect prior reminders within the dedup window. The action_url
  // ?b=<barangay_id> lets us match a previous reminder for the same barangay
  // without inventing a new column on `notifications`.
  const { data: priorRems } = await admin
    .from("notifications")
    .select("action_url")
    .eq("type", REMINDER_TYPE)
    .gte("created_at", dedupCutoff)
    .like("action_url", "%/community-profile?b=%");
  const recentBarangayIds = new Set(
    (priorRems ?? [])
      .map((n) => (n.action_url as string | null)?.match(/[?&]b=([0-9a-f-]{36})/i)?.[1])
      .filter((s): s is string => !!s)
  );

  let fired = 0;
  for (const b of stale) {
    if (recentBarangayIds.has(b.id)) continue;
    const latest    = latestByBarangay.get(b.id);
    const ageDays   = latest
      ? Math.round((now - new Date(latest).getTime()) / 86_400_000)
      : null;
    const title     = `Community profiling due for ${b.name}`;
    const message   = latest
      ? `It has been ${ageDays} days since the last approved resident-profiling cycle in ${b.name}. Schedule the next sampled cycle.`
      : `${b.name} has no completed normalized profiling cycle. Configure the sample and schedule the first privacy-approved cycle.`;
    const actionUrl = `/officer/community-profile?b=${b.id}`;

    // Fan out to every PARAYA staff recipient. Errors are swallowed by
    // notify() itself; we just count successful fires.
    await Promise.all(recipientIds.map((uid) =>
      notify({
        user_id:    uid,
        title,
        message,
        type:       REMINDER_TYPE,
        action_url: actionUrl,
      })
    ));
    fired += recipientIds.length;
  }

  return NextResponse.json({
    success: true,
    stale:   stale.length,
    fired,
    recipients: recipientIds.length,
  });
}

export const POST = GET;
