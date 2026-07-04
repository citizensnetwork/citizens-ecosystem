import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadPlaceMedia } from "@/lib/placeMedia";

// The browser client is used only for the phase-2 signed-URL upload. Stub it so
// no real network call happens; assert it received the token the route returned.
const uploadToSignedUrl = vi.fn().mockResolvedValue({ data: { path: "x" }, error: null });
const storageFrom = vi.fn().mockReturnValue({ uploadToSignedUrl });
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: storageFrom } }),
}));

describe("uploadPlaceMedia", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs via /api/media/upload, uploads to the signed URL, and inserts place_media rows", async () => {
    const publicUrl =
      "https://example.supabase.co/storage/v1/object/public/place-images/u1/gallery/places/p1/photo.jpg";

    // Phase 1: the route returns a signed upload URL (bucket/path/token/publicUrl/kind).
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bucket: "place-images",
        path: "u1/gallery/places/p1/photo.jpg",
        token: "signed-token",
        publicUrl,
        kind: "image",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const insert = vi.fn().mockResolvedValue({ error: null });
    const tableFrom = vi.fn().mockReturnValue({ insert });

    const supabase = {
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

    // Phase 1: signing request carries scope + entityId + file metadata as JSON.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/media/upload",
      expect.objectContaining({ method: "POST" }),
    );
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sentBody.scope).toBe("place-gallery");
    expect(sentBody.entityId).toBe("p1");
    expect(sentBody.contentType).toBe("image/jpeg");

    // Phase 2: bytes uploaded directly to Storage with the returned token.
    expect(storageFrom).toHaveBeenCalledWith("place-images");
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      "u1/gallery/places/p1/photo.jpg",
      "signed-token",
      expect.any(File),
      expect.objectContaining({ upsert: true }),
    );

    // Metadata row still written client-side via the user's RLS session.
    expect(tableFrom).toHaveBeenCalledWith("place_media");
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        place_id: "p1",
        uploaded_by: "u1",
        kind: "image",
        title: "Front door",
        url: publicUrl,
        sort_order: 3,
      }),
    ]);
  });
});
