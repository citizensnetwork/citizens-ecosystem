import type { SupabaseClient } from "@supabase/supabase-js";
import { safeMediaExtension } from "@/lib/validation";
import type { SelectedMedia } from "@/components/events/MediaGalleryUploader";

export type UploadedMediaRow = {
  event_id: string;
  url: string;
  kind: "image" | "video";
  thumbnail_url: string | null;
  title: string | null;
  sort_order: number;
  uploaded_by: string;
};

/**
 * Upload any freshly-picked media files for an event to the `event-images`
 * bucket, then insert rows into `event_photos` pointing at the public URLs.
 * Returns an error message on first failure, or `null` on success.
 *
 * The caller is responsible for ordering — `startSortOrder` is used as the
 * first `sort_order` value and incremented per item. This lets edit flows
 * append without clashing with pre-existing rows.
 */
export async function uploadEventMedia(
  supabase: SupabaseClient,
  opts: {
    eventId: string;
    userId: string;
    items: SelectedMedia[];
    startSortOrder?: number;
  }
): Promise<string | null> {
  const { eventId, userId, items, startSortOrder = 0 } = opts;
  if (items.length === 0) return null;

  const rows: UploadedMediaRow[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ext = safeMediaExtension(item.file.name, item.kind);
    // Include index + random suffix so concurrent uploads from the same user
    // within the same millisecond still produce unique storage paths.
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${userId}/gallery/${eventId}/${Date.now()}-${i}-${rand}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("event-images")
      .upload(path, item.file, {
        upsert: true,
        contentType: item.file.type || undefined,
      });
    if (upErr) {
      return `Gallery upload failed: ${upErr.message}`;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("event-images").getPublicUrl(path);

    rows.push({
      event_id: eventId,
      url: publicUrl,
      kind: item.kind,
      thumbnail_url: null,
      title: item.title.trim() ? item.title.trim() : null,
      sort_order: startSortOrder + i,
      uploaded_by: userId,
    });
  }

  const { error: insertErr } = await supabase.from("event_photos").insert(rows);
  if (insertErr) {
    return `Gallery metadata save failed: ${insertErr.message}`;
  }

  return null;
}
