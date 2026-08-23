import { z } from "zod";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authorizeCapability("communication.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("forum_threads")
    .select(`
      id, title, body, category, pinned, locked, created_at, updated_at,
      author:users!author_id(id, full_name, role),
      posts:forum_posts(id, body, created_at, updated_at, author:users!author_id(id, full_name, role))
    `)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sort posts oldest → newest
  if (Array.isArray(data?.posts)) {
    data.posts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authorizeAnyCapability(["communication.write", "communication.moderate"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  // Verify the user is either the author or an officer/admin
  const { data: thread } = await admin.from("forum_threads").select("author_id").eq("id", id).single();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const isOwner = thread.author_id === auth.actor.id;
  const isModerator = hasCapability(auth.actor.role, auth.actor.permissions, "communication.moderate");
  if (!isOwner && !isModerator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin.from("forum_threads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("communication.moderate");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = z.object({ pinned: z.boolean().optional(), locked: z.boolean().optional() }).strict().refine((value) => value.pinned !== undefined || value.locked !== undefined).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid moderation update" }, { status: 400 });
  const body = parsed.data;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.pinned !== undefined) updates.pinned = !!body.pinned;
  if (body.locked !== undefined) updates.locked = !!body.locked;

  const admin = createAdminClient();
  const { error } = await admin.from("forum_threads").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
