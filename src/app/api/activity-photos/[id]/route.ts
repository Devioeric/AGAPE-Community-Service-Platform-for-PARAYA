import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

const BUCKET      = "activity-photos";

// DELETE removes both the DB row and the underlying object in Storage. The
// row is the source of truth for the listing; if Storage removal fails (e.g.
// already absent), we keep the row delete because the metadata being gone is
// what users care about. The orphan file would still get cleaned by the
// bucket's lifecycle rules if configured.
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin  = createAdminClient();

  const { data: existing } = await admin
    .from("activity_photos")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (existing?.storage_path) {
    await admin.storage.from(BUCKET).remove([existing.storage_path]).catch(() => {});
  }

  const { error } = await admin.from("activity_photos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = z.object({ caption: z.string().trim().max(500).nullable().optional() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid caption" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("activity_photos")
    .update({ caption: parsed.data.caption || null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
