// Profiling reminders carry the barangay id in their link so the cron can skip
// barangays already reminded within the dedup window. Earlier builds linked to
// /officer/community-profile (and briefly /officer/profiling/legacy); those
// links must still count, or the first run after a deploy repeats reminders.
const REMINDER_LINK = /^\/officer\/(?:community-profile|profiling(?:\/legacy)?)\?b=([0-9a-f-]{36})$/i;

export function profilingReminderUrl(barangayId: string): string {
  return `/officer/profiling?b=${barangayId}`;
}

export function reminderBarangayId(actionUrl: string | null | undefined): string | null {
  return actionUrl?.match(REMINDER_LINK)?.[1] ?? null;
}
