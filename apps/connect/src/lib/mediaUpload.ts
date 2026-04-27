import type { SupabaseClient } from "@supabase/supabase-js";
import { safeMediaExtension, type MediaKind } from "@/lib/validation";

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

  const rows: UploadedMediaRow[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ext = safeMediaExtension(item.file.name, item.kind);
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${userId}/gallery/${storageFolder}/${entityId}/${Date.now()}-${i}-${rand}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, item.file, {
        upsert: true,
        contentType: item.file.type || undefined,
      });

    if (uploadError) {
      return `Gallery upload failed: ${uploadError.message}`;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path);

    rows.push({
      [entityIdColumn]: entityId,
      url: publicUrl,
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