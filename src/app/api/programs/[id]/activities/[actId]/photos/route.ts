import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string; actId: string }> };

const BUCKET      = "activity-photos";
// Conservative client-side enforcement; Supabase Storage has its own bucket
// limits configured in the dashboard. Keeping this in lockstep avoids
// surprising 413s for users.
const MAX_BYTES   = 8 * 1024 * 1024;
const ALLOWED     = ["image/jpeg", "image/png", "image/webp", "image/heic"];

// GET — list every photo for one activity, with a public URL ready for <img>.
// Uses the admin client so RLS doesn't gate us on the metadata read; the role
// check above already enforces who can call this.
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, actId } = await params;
  const admin = createAdminClient();
  const { data: activity } = await admin.from("program_activities").select("id").eq("id", actId).eq("program_id", id).maybeSingle();
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });

  const { data, error } = await admin
    .from("activity_photos")
    .select("id, storage_path, caption, uploaded_by, created_at, users:uploaded_by(full_name)")
    .eq("activity_id", actId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build a public URL per photo. If the bucket is private switch this to
  // createSignedUrl(path, 3600) and return short-lived links instead.
  const photos = (data ?? []).map((p) => ({
    id:          p.id,
    caption:     p.caption,
    created_at:  p.created_at,
    uploaded_by: (p.users as unknown as { full_name: string | null } | null)?.full_name ?? null,
    url:         admin.storage.from(BUCKET).getPublicUrl(p.storage_path).data.publicUrl,
    storage_path: p.storage_path,
  }));
  return NextResponse.json({ data: photos });
}

// POST — upload one photo (multipart/form-data). Body fields:
//   file:    File (required)
//   caption: optional string
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, actId } = await params;
  const form = await request.formData();
  const file = form.get("file");
  const caption = (form.get("caption") as string | null)?.trim() || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.` },
      { status: 413 }
    );
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ALLOWED.map((t) => t.replace("image/", "")).join(", ")}.` },
      { status: 415 }
    );
  }

  // Build a deterministic path under the activity so cleanup on DELETE
  // can target the whole prefix if we ever want to.
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `activities/${actId}/${crypto.randomUUID()}.${ext}`;

  const admin  = createAdminClient();
  const { data: activity } = await admin.from("program_activities").select("id").eq("id", actId).eq("program_id", id).maybeSingle();
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  const bytes  = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });

  const { data: row, error: dbErr } = await admin
    .from("activity_photos")
    .insert({
      activity_id:  actId,
      storage_path: path,
      caption,
      uploaded_by:  auth.actor.id,
    })
    .select("id, storage_path, caption, created_at")
    .single();

  if (dbErr) {
    // Best-effort cleanup of the orphaned file so we don't leak storage.
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      ...row,
      url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    },
  }, { status: 201 });
}
