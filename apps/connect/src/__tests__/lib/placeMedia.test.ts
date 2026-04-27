import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadPlaceMedia } from "@/lib/placeMedia";

describe("uploadPlaceMedia", () => {
  it("uploads files to place-images and inserts place_media rows", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://example.supabase.co/storage/v1/object/public/place-images/u1/gallery/places/p1/photo.jpg" },
    });
    const storageFrom = vi.fn().mockReturnValue({ upload, getPublicUrl });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const tableFrom = vi.fn().mockReturnValue({ insert });

    const supabase = {
      storage: { from: storageFrom },
      from: tableFrom,
    } as unknown as SupabaseClient;

    const error = await uploadPlaceMedia(supabase, {
      placeId: "p1",
      userId: "u1",
      items: [
        {
          file: new File(["x"], "photo.jpg", { type: "image/jpeg" }),
          kind: "image",
          previewUrl: "blob:preview",
          title: "Front door",
        },
      ],
      startSortOrder: 3,
    });

    expect(error).toBeNull();
    expect(storageFrom).toHaveBeenCalledWith("place-images");
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^u1\/gallery\/places\/p1\//),
      expect.any(File),
      expect.objectContaining({ contentType: "image/jpeg", upsert: true }),
    );
    expect(tableFrom).toHaveBeenCalledWith("place_media");
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        place_id: "p1",
        uploaded_by: "u1",
        kind: "image",
        title: "Front door",
        sort_order: 3,
      }),
    ]);
  });
});