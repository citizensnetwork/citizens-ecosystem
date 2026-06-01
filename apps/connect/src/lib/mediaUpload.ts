import type { SupabaseClient } from "@supabase/supabase-js";
import { type MediaKind } from "@/lib/validation";
import { uploadMediaFile, type UploadScope } from "@/lib/uploadMedia";

export type SelectedMedia = {
  file: File;
  kind: MediaKind;
  previewUrl: string;
  title: string;
};

type MediaTable = "event_photos" | "place_media";
type MediaEntityColumn = "event_id" | "place_id";
type MediaBucket = "event-images" | "place-images";

export type UploadedMediaRow = {
  url: string;
  kind: MediaKind;
  thumbnail_url: string | null;
  title: string | null;
  sort_order: number;
  uploaded_by: string;
} & ({ event_id: string } | { place_id: string });

export async function uploadEntityMedia(
  supabase: SupabaseClient,
  opts: {
    bucket: MediaBucket;
    table: MediaTable;
    entityIdColumn: MediaEntityColumn;
    entityId: string;
    userId: string;
    items: SelectedMedia[];
    startSortOrder?: number;
    storageFolder: "events" | "places";
  },
): Promise<string | null> {
  const {
    bucket,
    table,
    entityIdColumn,
    entityId,
    userId,
    items,
    startSortOrder = 0,
    storageFolder,
  } = opts;
  if (items.length === 0) return null;

  // The browser Supabase client's JWT is unreliable at the Storage endpoint, so
  // the bytes go through the server route (admin client) via uploadMediaFile.
  // The `bucket` param is retained for the caller's type-safety but the route
  // derives the bucket from the scope below.
  void bucket;
  const scope: UploadScope = storageFolder === "events" ? "event-gallery" : "place-gallery";

  const rows: UploadedMediaRow[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const uploaded = await uploadMediaFile(item.file, { scope, entityId });
    if ("error" in uploaded) {
      return `Gallery upload failed: ${uploaded.error}`;
    }

    rows.push({
      [entityIdColumn]: entityId,
      url: uploaded.url,
      kind: item.kind,
      thumbnail_url: null,
      title: item.title.trim() ? item.title.trim() : null,
      sort_order: startSortOrder + i,
      uploaded_by: userId,
    } as UploadedMediaRow);
  }

  const { error: insertError } = await supabase.from(table).insert(rows);
  if (insertError) {
    return `Gallery metadata save failed: ${insertError.message}`;
  }

  return null;
}