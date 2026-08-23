import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("communication.write");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = z.object({ body: z.string().trim().min(1).max(10_000) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Reply body is required" }, { status: 400 });
  const body = parsed.data;

  // Ensure the thread exists and is not locked (moderators bypass the lock)
  const admin = createAdminClient();
  const { data: thread } = await admin.from("forum_threads").select("id, locked").eq("id", id).single();
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  const isModerator = hasCapability(auth.actor.role, auth.actor.permissions, "communication.moderate");
  if (thread.locked && !isModerator) {
    return NextResponse.json({ error: "Thread is locked" }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("forum_posts")
    .insert({ thread_id: id, author_id: auth.actor.id, body: body.body })
    .select("id, body, created_at, updated_at, author:users!author_id(id, full_name, role)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
