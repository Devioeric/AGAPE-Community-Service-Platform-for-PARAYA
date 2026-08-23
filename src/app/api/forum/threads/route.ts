import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const VALID_CATEGORIES = ["general", "programs", "schedule", "barangay", "announcement", "question"];

export async function GET(request: Request) {
  const auth = await authorizeCapability("communication.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search   = searchParams.get("search")?.trim();

  const admin = createAdminClient();
  let query = admin
    .from("forum_threads")
    .select(`
      id, title, body, category, pinned, locked, created_at, updated_at,
      author:users!author_id(id, full_name, role),
      forum_posts(count)
    `)
    .order("pinned",     { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (category) query = query.eq("category", category);
  if (search) {
    const q = `%${search}%`;
    query = query.or(`title.ilike.${q},body.ilike.${q}`);
  }

  const { data, error } = await query;
  if (error) {
    // Table doesn't exist yet (migration not run) → return empty list with a hint.
    if (error.code === "42P01" || /relation .* does not exist/i.test(error.message)) {
      return NextResponse.json({
        data: [],
        hint: "Run supabase/migrations/forum.sql in the Supabase SQL Editor to enable the forum.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Normalize the post-count aggregate result
  const normalized = (data ?? []).map((t) => ({
    ...t,
    post_count: Array.isArray(t.forum_posts) ? (t.forum_posts[0]?.count ?? 0) : 0,
    forum_posts: undefined,
  }));

  return NextResponse.json({ data: normalized });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("communication.write");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10_000), category: z.enum(["general", "programs", "schedule", "barangay", "announcement", "question"]).optional() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid discussion" }, { status: 400 });
  const body = parsed.data;

  const category = body.category && VALID_CATEGORIES.includes(body.category) ? body.category : "general";

  const { data, error } = await auth.supabase
    .from("forum_threads")
    .insert({
      title:     body.title.trim(),
      body:      body.body.trim(),
      category,
      author_id: auth.actor.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
