import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadEntityMedia, type SelectedMedia } from "@/lib/mediaUpload";

export async function uploadPlaceMedia(
  supabase: SupabaseClient,
  opts: {
    placeId: string;
    userId: string;
    items: SelectedMedia[];
    startSortOrder?: number;
  },
): Promise<string | null> {
  return uploadEntityMedia(supabase, {
    bucket: "place-images",
    table: "place_media",
    entityIdColumn: "place_id",
    entityId: opts.placeId,
    userId: opts.userId,
    items: opts.items,
    startSortOrder: opts.startSortOrder,
    storageFolder: "places",
  });
}