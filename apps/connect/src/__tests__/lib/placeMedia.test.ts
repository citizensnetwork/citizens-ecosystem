import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadPlaceMedia } from "@/lib/placeMedia";

describe("uploadPlaceMedia", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads files through /api/media/upload and inserts place_media rows", async () => {
    // Binary upload now goes through the server route (browser-client JWT is
    // unreliable at the Storage endpoint). Mock fetch to return the public URL.
    const publicUrl =
      "https://example.supabase.co/storage/v1/object/public/place-images/u1/gallery/places/p1/photo.jpg";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: publicUrl, kind: "image" }),
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

    // Uploaded via the server route with the place-gallery scope + entityId.
    expect(fetchMock).toHaveBeenCalledWith("/api/media/upload", {
      method: "POST",
      body: expect.any(FormData),
    });
    const sentForm = fetchMock.mock.calls[0][1].body as FormData;
    expect(sentForm.get("scope")).toBe("place-gallery");
    expect(sentForm.get("entityId")).toBe("p1");
    expect(sentForm.get("file")).toBeInstanceOf(File);

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
