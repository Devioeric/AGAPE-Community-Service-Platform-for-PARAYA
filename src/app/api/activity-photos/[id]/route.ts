import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { programMutationError } from "@/lib/programs/completion-contract";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// Commit metadata removal first: the database may reject removal of required
// completion evidence. Physical cleanup is deliberately deferred because old
// rows can share/rebind a storage_path; a separate reference-count query cannot
// safely authorize object deletion across that race. Do not claim a file purge.
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid photo identifier." }, { status: 400 });
  const admin  = createAdminClient();
  try {
    const { data: deleted, error } = await admin.from("activity_photos")
      .delete().eq("id", id).select("id").maybeSingle();
    if (error) {
      const failure = programMutationError(error);
      return NextResponse.json({ error: failure.error, code: failure.code }, { status: failure.status });
    }
    if (!deleted) return NextResponse.json({ error: "Activity photo not found." }, { status: 404 });
    return NextResponse.json({
      success: true,
      cleanup_pending: true,
      warning: "Photo removed from the activity. The private file is retained pending safe administrator cleanup; it has not been purged.",
    });
  } catch {
    return NextResponse.json({ error: "The activity photo could not be removed. Refresh the photo list before trying again." }, { status: 500 });
  }
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
