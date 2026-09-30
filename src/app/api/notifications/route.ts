import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ACTIVE_LOGIN_ROLES, isRoleEnabled } from "@/lib/auth/roles";
import { isActiveAccount } from "@/lib/auth/account-status";

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
}).strict().refine(value => new Set(value.ids).size === value.ids.length);
const inboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(25),
  filter: z.enum(["all", "unread", "read"]).default("all"),
}).strict();
const FIELDS = "id,title,message,type,is_read,created_at,channel,action_url";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Self-service, including Finance: no broader communication capability is granted. */
async function notificationActor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };
  const { data: profile, error } = await supabase.from("users").select("role,status,is_active").eq("id", user.id).maybeSingle();
  if (error) return { ok: false as const, status: 503, error: "Notifications are temporarily unavailable." };
  if (!profile || !isActiveAccount(profile) || !(ACTIVE_LOGIN_ROLES as readonly string[]).includes(profile.role) || !isRoleEnabled(profile.role)) {
    return { ok: false as const, status: 403, error: "Notifications are unavailable for this account." };
  }
  return { ok: true as const, supabase, userId: user.id };
}

export async function GET(request: Request) {
  try {
    const auth = await notificationActor();
    if (!auth.ok) return response({ error: auth.error }, auth.status);
    const parsed = inboxQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return response({ error: "Invalid notification page or filter." }, 400);
    const { page, page_size: pageSize, filter } = parsed.data;
    let query = auth.supabase.from("notifications").select(FIELDS, { count: "exact" }).eq("user_id", auth.userId);
    if (filter !== "all") query = query.eq("is_read", filter === "read");
    const [inbox, unread] = await Promise.all([
      query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1),
      auth.supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", auth.userId).eq("is_read", false),
    ]);
    if (inbox.error || unread.error || typeof inbox.count !== "number" || typeof unread.count !== "number"
      || !Number.isSafeInteger(inbox.count) || !Number.isSafeInteger(unread.count) || inbox.count < 0 || unread.count < 0) {
      return response({ error: "Notifications could not be loaded. Please retry." }, 503);
    }
    return response({ data: inbox.data ?? [], unreadCount: unread.count, total: inbox.count, page, pageSize, hasMore: page * pageSize < inbox.count });
  } catch { return response({ error: "Notifications could not be loaded. Please retry." }, 503); }
}

/** Marks exactly the displayed/selected IDs, never an implicit whole-inbox update. */
export async function PATCH(request: Request) {
  try {
    const auth = await notificationActor();
    if (!auth.ok) return response({ error: auth.error }, auth.status);
    const parsed = markReadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return response({ error: "Invalid notification selection" }, 400);
    const { ids } = parsed.data;
    // Reject a mixed own/other-user selection before writing any selected row.
    const selected = await auth.supabase.from("notifications").select("id").eq("user_id", auth.userId).in("id", ids);
    if (selected.error) return response({ error: "Notifications could not be updated. Please retry." }, 503);
    if (selected.data?.length !== ids.length) return response({ error: "One or more selected notifications are unavailable." }, 404);
    const updated = await auth.supabase.from("notifications").update({ is_read: true }).eq("user_id", auth.userId).in("id", ids).select("id");
    if (updated.error) return response({ error: "Notifications could not be updated. Please retry." }, 503);
    if (updated.data?.length !== ids.length) return response({ error: "The notification selection changed. Refresh the inbox and retry." }, 409);
    return response({ success: true, markedCount: updated.data.length });
  } catch { return response({ error: "Notifications could not be updated. Please retry." }, 503); }
}
