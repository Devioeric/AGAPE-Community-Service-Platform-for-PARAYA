"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { hasCapability } from "@/lib/auth/capabilities";
import { ACTIVITY_PHOTO_MAX_BYTES, ACTIVITY_PHOTO_TYPES } from "@/lib/programs/activity-photo-contract";

// Inline photo gallery + uploader for one program activity.
// Self-contained — owns its own photo list state so it can be dropped into any
// activity row without lifting state to the parent. The parent only needs to
// pass the program + activity id.

interface ActivityPhoto {
  id:           string;
  url:          string;
  caption:      string | null;
  created_at:   string;
  uploaded_by?: string | null;
}

export function ActivityPhotos({
  programId, activityId,
  // When provided, the parent gets notified of count changes so it can refresh
  // a completion checklist or KPI without re-fetching the whole program.
  onCountChange,
  compact = false,
}: {
  programId:      string;
  activityId:     string;
  onCountChange?: (n: number) => void;
  compact?:       boolean;
}) {
  const { role, permissions } = useDashboardActor();
  const canManage = hasCapability(role, permissions, "program.manage");
  const [photos, setPhotos]     = useState<ActivityPhoto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing]   = useState<ActivityPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Parent passes onCountChange inline, so its identity changes every render.
  // Holding it in a ref keeps fetchPhotos stable — otherwise the effect chain
  // (fetch → onCountChange → parent re-render → new onCountChange → fetch …)
  // becomes an infinite loop and the spinner never resolves.
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => { onCountChangeRef.current = onCountChange; }, [onCountChange]);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/activities/${activityId}/photos`, { cache: "no-store" });
      if (!res.ok) throw new Error("Photo request failed");
      const j = await res.json();
      if (!Array.isArray(j.data)) throw new Error("Invalid photo list");
      const list = j.data as ActivityPhoto[];
      setPhotos(list);
      setViewing((current) => current ? list.find((photo) => photo.id === current.id) ?? null : null);
      onCountChangeRef.current?.(list.length);
    } catch {
      setError("Photos could not be loaded. Refresh the private links to try again.");
    } finally {
      setLoading(false);
    }
  }, [programId, activityId]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  async function handleFiles(files: FileList | null) {
    if (!canManage || !files || files.length === 0) return;
    setUploading(true);
    let success = 0;
    try {
    for (const file of Array.from(files)) {
      if (!ACTIVITY_PHOTO_TYPES.some((type) => type === file.type) || file.size === 0 || file.size > ACTIVITY_PHOTO_MAX_BYTES) {
        toast.error("Choose a nonempty JPEG, PNG or WebP image up to 10 MB.");
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/programs/${programId}/activities/${activityId}/photos`,
        { method: "POST", body: form }
      );
      if (res.ok) {
        success += 1;
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? `Failed to upload ${file.name}`);
      }
    }
    } catch {
      toast.error("The upload was interrupted. Check the photo list before retrying.");
    } finally {
    if (success > 0) {
      toast.success(`Uploaded ${success} photo${success === 1 ? "" : "s"}.`);
      await fetchPhotos();
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePhoto(id: string) {
    if (!canManage) return;
    if (!confirm("Remove this photo from the activity? The private file will be retained pending safe administrator cleanup.")) return;
    try {
      const res = await fetch(`/api/activity-photos/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Failed to remove photo.");
        return;
      }
      setPhotos((p) => {
        const next = p.filter((x) => x.id !== id);
        onCountChangeRef.current?.(next.length);
        return next;
      });
      if (viewing?.id === id) setViewing(null);
      if (j.cleanup_pending) toast.warning("Photo removed from the activity. Its private file is retained pending safe administrator cleanup.");
    } catch {
      toast.error("Photo removal was interrupted. Refresh the photo list before trying again.");
    }
  }

  const tileSize = compact ? "w-16 h-16" : "w-20 h-20";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Camera className="w-3.5 h-3.5" />
        <span>Photos</span>
        {!loading && (
          <span className="tabular-nums">({photos.length})</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setViewing(p)}
                className={cn(
                  tileSize,
                  "relative rounded-lg border border-border overflow-hidden bg-muted hover:ring-2 hover:ring-primary/30 transition-all group"
                )}
                title={p.caption ?? "Open photo"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption ?? "Activity photo"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={() => setError("A private photo link expired or could not load. Refresh links to try again.")}
                />
              </button>
            ))}

            {/* Upload tile */}
            {canManage && <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={cn(
                tileSize,
                "rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-primary transition-colors text-[11px]"
              )}
            >
              {uploading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Plus className="w-4 h-4" /><span>Add</span></>}
            </button>}
            {canManage && <input
              ref={fileRef}
              type="file"
              accept={ACTIVITY_PHOTO_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />}
          </>
        )}
      </div>
      {error && <div role="alert" className="text-xs text-warning">{error} <button type="button" className="underline" disabled={loading} onClick={() => void fetchPhotos()}>Refresh links</button></div>}

      {/* Lightbox viewer */}
      {viewing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Activity photo viewer"
          onClick={() => setViewing(null)}
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl max-h-full bg-card rounded-xl overflow-hidden flex flex-col"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewing.url}
              alt={viewing.caption ?? "Activity photo"}
              className="max-h-[70vh] object-contain bg-black"
            />
            <div className="p-3 flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground min-w-0">
                {viewing.caption && <p className="text-foreground line-clamp-2">{viewing.caption}</p>}
                <p>
                  {viewing.uploaded_by ?? "Officer"} ·{" "}
                  {new Date(viewing.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {canManage && <button
                  type="button"
                  onClick={() => deletePhoto(viewing.id)}
                  className="h-8 px-2.5 text-xs rounded-lg border border-danger/30 text-danger hover:bg-danger/5 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>}
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  aria-label="Close photo viewer"
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
