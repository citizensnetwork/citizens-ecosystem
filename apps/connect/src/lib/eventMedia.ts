import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadEntityMedia, type SelectedMedia } from "@/lib/mediaUpload";

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
  return uploadEntityMedia(supabase, {
    bucket: "event-images",
    table: "event_photos",
    entityIdColumn: "event_id",
    entityId: opts.eventId,
    userId: opts.userId,
    items: opts.items,
    startSortOrder: opts.startSortOrder,
    storageFolder: "events",
  });
}
