import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authorizeAnyCapability(["communication.write", "communication.moderate"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: post } = await admin.from("forum_posts").select("author_id").eq("id", id).single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const isOwner = post.author_id === auth.actor.id;
  const isModerator = hasCapability(auth.actor.role, auth.actor.permissions, "communication.moderate");
  if (!isOwner && !isModerator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin.from("forum_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
