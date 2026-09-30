import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { ACTIVITY_PHOTO_MAX_BYTES, ACTIVITY_PHOTO_TYPES, ACTIVITY_PHOTO_URL_TTL_SECONDS, activityPhotoExtension, hasActivityPhotoSignature } from "@/lib/programs/activity-photo-contract";

type Ctx = { params: Promise<{ id: string; actId: string }> };

const BUCKET      = "activity-photos";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

// Authorize the activity before issuing short-lived private image links.
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

  if (error) return NextResponse.json({ error: "Activity photos could not be loaded." }, { status: 500 });
  const paths = (data ?? []).map((photo) => photo.storage_path);
  const signed = paths.length > 0
    ? await admin.storage.from(BUCKET).createSignedUrls(paths, ACTIVITY_PHOTO_URL_TTL_SECONDS)
    : { data: [], error: null };
  if (signed.error || signed.data?.length !== paths.length || signed.data?.some((item) => item.error || !item.signedUrl)) {
    return NextResponse.json({ error: "Private photo links could not be loaded. Try again." }, { status: 503, headers: PRIVATE_HEADERS });
  }
  const urls = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]));
  const photos = (data ?? []).map((p) => ({
    id:          p.id,
    caption:     p.caption,
    created_at:  p.created_at,
    uploaded_by: (p.users as unknown as { full_name: string | null } | null)?.full_name ?? null,
    url:         urls.get(p.storage_path),
  }));
  return NextResponse.json({ data: photos }, { headers: PRIVATE_HEADERS });
}

// POST — upload one photo (multipart/form-data). Body fields:
//   file:    File (required)
//   caption: optional string
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("program.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, actId } = await params;
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  const file = form.get("file");
  const rawCaption = form.get("caption");
  if (rawCaption !== null && (typeof rawCaption !== "string" || rawCaption.trim().length > 500)) {
    return NextResponse.json({ error: "Caption must be at most 500 characters." }, { status: 400 });
  }
  const caption = typeof rawCaption === "string" ? rawCaption.trim() || null : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "Empty images cannot be uploaded." }, { status: 400 });
  if (file.size > ACTIVITY_PHOTO_MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${ACTIVITY_PHOTO_MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }
  const ext = activityPhotoExtension(file.type);
  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ACTIVITY_PHOTO_TYPES.map((type) => type.replace("image/", "")).join(", ")}.` },
      { status: 415 }
    );
  }

  // Use a server-selected extension, never the caller's filename.
  const path = `activities/${actId}/${crypto.randomUUID()}.${ext}`;

  const admin  = createAdminClient();
  const { data: activity } = await admin.from("program_activities").select("id").eq("id", actId).eq("program_id", id).maybeSingle();
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  const bytes  = new Uint8Array(await file.arrayBuffer());
  if (!hasActivityPhotoSignature(file.type, bytes)) {
    return NextResponse.json({ error: "The file does not match its image format." }, { status: 415 });
  }
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: "The photo could not be uploaded. Try again." }, { status: 500 });

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
    return NextResponse.json({ error: "Photo details could not be saved." }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      id: row.id,
      caption: row.caption,
      created_at: row.created_at,
    },
  }, { status: 201, headers: PRIVATE_HEADERS });
}
