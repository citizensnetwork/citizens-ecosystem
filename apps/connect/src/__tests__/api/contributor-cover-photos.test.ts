import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();
const mockAdmin = {
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi
        .fn()
        .mockReturnValue({ data: { publicUrl: "https://cdn.example/u1/covers/1.jpg" } }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdmin),
}));

const { POST, PATCH, DELETE } = await import("@/app/api/contributor/cover-photos/route");

const USER_ID = "11111111-2222-3333-4444-555555555555";

function makeFormReq(file: File | null, caption?: string): Request {
  const fd = new FormData();
  if (file) fd.append("file", file);
  if (caption) fd.append("caption", caption);
  // JSDOM doesn't fully serialise multipart bodies through `Request`. Stub
  // `formData()` directly so the route can read the FormData without parsing
  // multipart in test.
  const req = new Request("http://localhost/api/contributor/cover-photos", {
    method: "POST",
  });
  Object.defineProperty(req, "formData", {
    value: () => Promise.resolve(fd),
  });
  return req;
}

function makeJsonReq(method: "PATCH" | "DELETE", body: unknown, search = "") {
  return new Request(
    `http://localhost/api/contributor/cover-photos${search}`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    },
  );
}

function imageFile(name = "cover.jpg", size = 200_000, type = "image/jpeg"): File {
  const data = new Uint8Array(size);
  return new File([data], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

function mockApprovedContributor(coverPhotos: unknown[] = []) {
  mockClient.auth.getUser.mockResolvedValueOnce({
    data: { user: { id: USER_ID } },
    error: null,
  });
  mockClient._chain.maybeSingle.mockResolvedValueOnce({
    data: {
      id: USER_ID,
      role: "contributor",
      contributor_status: "approved",
      cover_photo_urls: coverPhotos,
    },
    error: null,
  });
}

describe("POST /api/contributor/cover-photos", () => {
  it("401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await POST(makeFormReq(imageFile()));
    expect(res.status).toBe(401);
  });

  it("403 when not an approved contributor", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { id: USER_ID, role: "citizen", contributor_status: null },
      error: null,
    });
    const res = await POST(makeFormReq(imageFile()));
    expect(res.status).toBe(403);
  });

  it("400 when no file is provided", async () => {
    mockApprovedContributor();
    const res = await POST(makeFormReq(null));
    expect(res.status).toBe(400);
  });

  it("400 when MIME type is not allowed (SVG rejected)", async () => {
    mockApprovedContributor();
    const res = await POST(makeFormReq(imageFile("evil.svg", 1000, "image/svg+xml")));
    expect(res.status).toBe(400);
  });

  it("400 when already at 5-photo cap", async () => {
    mockApprovedContributor([
      { url: "https://x/1" },
      { url: "https://x/2" },
      { url: "https://x/3" },
      { url: "https://x/4" },
      { url: "https://x/5" },
    ]);
    const res = await POST(makeFormReq(imageFile()));
    expect(res.status).toBe(400);
  });

  it("appends new photo and returns updated list", async () => {
    mockApprovedContributor([]);
    // POST re-reads the row before writing to mitigate TOCTOU at the cap.
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { cover_photo_urls: [] },
      error: null,
    });
    const res = await POST(makeFormReq(imageFile(), "Hello"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.photos)).toBe(true);
    expect(json.photos).toHaveLength(1);
    expect(json.photos[0].caption).toBe("Hello");
  });

  it("409 when a concurrent upload filled the cap between auth-check and write (TOCTOU)", async () => {
    mockApprovedContributor([{ url: "https://x/1" }]);
    // Fresh re-read returns a full list (another request slipped in).
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: {
        cover_photo_urls: [
          { url: "https://x/1" },
          { url: "https://x/2" },
          { url: "https://x/3" },
          { url: "https://x/4" },
          { url: "https://x/5" },
        ],
      },
      error: null,
    });
    const res = await POST(makeFormReq(imageFile()));
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/contributor/cover-photos", () => {
  it("rejects unknown URLs (no off-platform injection)", async () => {
    mockApprovedContributor([{ url: "https://cdn.example/u1/covers/1.jpg" }]);
    const res = await PATCH(
      makeJsonReq("PATCH", {
        photos: [{ url: "https://evil.example/x.jpg" }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts re-order of existing URLs", async () => {
    mockApprovedContributor([
      { url: "https://cdn.example/a.jpg" },
      { url: "https://cdn.example/b.jpg" },
    ]);
    const res = await PATCH(
      makeJsonReq("PATCH", {
        photos: [
          { url: "https://cdn.example/b.jpg", caption: "B" },
          { url: "https://cdn.example/a.jpg" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.photos[0].url).toBe("https://cdn.example/b.jpg");
    expect(json.photos[0].caption).toBe("B");
  });

  it("400 when payload exceeds the 5-photo cap", async () => {
    mockApprovedContributor([
      { url: "https://cdn.example/a.jpg" },
    ]);
    const tooMany = Array.from({ length: 6 }, () => ({
      url: "https://cdn.example/a.jpg",
    }));
    const res = await PATCH(makeJsonReq("PATCH", { photos: tooMany }));
    expect(res.status).toBe(400);
  });

  it("400 when payload contains duplicate URLs", async () => {
    mockApprovedContributor([
      { url: "https://cdn.example/a.jpg" },
      { url: "https://cdn.example/b.jpg" },
    ]);
    const res = await PATCH(
      makeJsonReq("PATCH", {
        photos: [
          { url: "https://cdn.example/a.jpg" },
          { url: "https://cdn.example/a.jpg" },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/contributor/cover-photos", () => {
  it("400 on invalid index", async () => {
    mockApprovedContributor([{ url: "https://cdn.example/a.jpg" }]);
    const res = await DELETE(makeJsonReq("DELETE", null, "?index=5"));
    expect(res.status).toBe(400);
  });

  it("removes the entry at the given index", async () => {
    mockApprovedContributor([
      { url: "https://cdn.example/a.jpg" },
      { url: "https://cdn.example/b.jpg" },
    ]);
    const res = await DELETE(makeJsonReq("DELETE", null, "?index=0"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.photos).toHaveLength(1);
    expect(json.photos[0].url).toBe("https://cdn.example/b.jpg");
  });
});
