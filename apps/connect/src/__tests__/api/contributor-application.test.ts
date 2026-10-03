import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

// The caller's own session (reads, RLS-scoped) and the service-role client
// (the only writer — migration 180 took the table's client write privileges away).
const mockClient = createMockSupabaseClient();
const adminClient = createMockSupabaseClient();
const mockGetRouteAuth = vi.fn();

vi.mock("@/lib/supabase/route", () => ({
  getRouteAuth: (...args: unknown[]) => mockGetRouteAuth(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClient,
}));

const { GET, PATCH } = await import("@/app/api/contributor/application/route");

const USER_ID = "11111111-2222-3333-4444-555555555555";
const APP_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function patchReq(body: unknown) {
  return new Request("http://localhost/api/contributor/application", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
const getReq = () => new Request("http://localhost/api/contributor/application");

function signedIn() {
  mockGetRouteAuth.mockResolvedValueOnce({ supabase: mockClient, user: { id: USER_ID } });
}
function signedOut() {
  mockGetRouteAuth.mockResolvedValueOnce({ supabase: mockClient, user: null });
}
/** The pending application the route finds through the caller's own session. */
function hasPending(id: string | null = APP_ID) {
  mockClient._chain.maybeSingle.mockResolvedValueOnce({ data: id ? { id } : null, error: null });
}
function written(): Record<string, unknown> | undefined {
  return adminClient._chain.update.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  adminClient._chain._result = { data: [{ id: APP_ID }], error: null, count: 1 };
});

describe("GET /api/contributor/application", () => {
  it("returns 401 when signed out", async () => {
    signedOut();
    expect((await GET(getReq())).status).toBe(401);
  });

  it("returns the caller's latest application through their OWN session (RLS), never the service role", async () => {
    signedIn();
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { id: APP_ID, status: "pending", display_name: "Grace Hub" },
      error: null,
    });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: APP_ID, status: "pending", display_name: "Grace Hub" });
    expect(mockClient.from).toHaveBeenCalledWith("contributor_applications");
    expect(mockClient._chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it("does not select reviewer ids or the applicant's user id", async () => {
    signedIn();
    mockClient._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await GET(getReq());
    const columns = mockClient._chain.select.mock.calls.at(-1)?.[0] as string;
    expect(columns).toContain("rejection_reason");
    expect(columns).not.toContain("reviewer_id");
    expect(columns).not.toContain("user_id");
  });

  it("returns data:null when they have never applied", async () => {
    signedIn();
    mockClient._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toBeNull();
  });

  it("returns 500 on a database error", async () => {
    signedIn();
    mockClient._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(getReq())).status).toBe(500);
  });
});

describe("PATCH /api/contributor/application", () => {
  it("returns 401 when signed out", async () => {
    signedOut();
    expect((await PATCH(patchReq({ bio: "x" }))).status).toBe(401);
  });

  it("returns 400 on invalid JSON or a non-object body", async () => {
    signedIn();
    expect((await PATCH(patchReq("{not json"))).status).toBe(400);
    signedIn();
    expect((await PATCH(patchReq([1, 2]))).status).toBe(400);
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it("is rate-limited", async () => {
    mockGetRouteAuth.mockResolvedValue({ supabase: mockClient, user: { id: USER_ID } });
    let last = 0;
    for (let i = 0; i < 40; i++) last = (await PATCH(patchReq("{bad"))).status;
    expect(last).toBe(429);
  });

  it("refuses with 409 when there is no PENDING application (approved, rejected or never applied), writing nothing", async () => {
    signedIn();
    hasPending(null);
    const res = await PATCH(patchReq({ bio: "hello" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_pending_application");
    expect(adminClient.from).not.toHaveBeenCalled();
    // The lookup itself is restricted to the caller's pending row.
    expect(mockClient._chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(mockClient._chain.eq).toHaveBeenCalledWith("status", "pending");
  });

  it("writes ONLY allowlisted columns, whatever else the body names", async () => {
    signedIn();
    hasPending();
    const res = await PATCH(
      patchReq({
        bio: "We serve the city.",
        status: "approved",
        user_id: "99999999-9999-9999-9999-999999999999",
        reviewer_id: USER_ID,
        reviewed_at: "2026-01-01",
        rejection_reason: "x",
        role: "admin",
        contributor_status: "approved",
        id: "other",
      }),
    );
    expect(res.status).toBe(200);
    expect(written()).toEqual({ bio: "We serve the city." });
  });

  it("pins the write to this application, this user and the pending state, via the service-role client", async () => {
    signedIn();
    hasPending();
    await PATCH(patchReq({ bio: "hello" }));
    expect(mockClient._chain.update).not.toHaveBeenCalled();
    expect(adminClient.from).toHaveBeenCalledWith("contributor_applications");
    expect(adminClient._chain.eq).toHaveBeenCalledWith("id", APP_ID);
    expect(adminClient._chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(adminClient._chain.eq).toHaveBeenCalledWith("status", "pending");
  });

  it("returns 409 if the application was decided between the lookup and the write", async () => {
    signedIn();
    hasPending();
    adminClient._chain._result = { data: [], error: null, count: 0 };
    const res = await PATCH(patchReq({ bio: "late edit" }));
    expect(res.status).toBe(409);
  });

  it("returns 500 on a database error", async () => {
    signedIn();
    hasPending();
    adminClient._chain._result = { data: null, error: { message: "boom" }, count: 0 };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await PATCH(patchReq({ bio: "x" }))).status).toBe(500);
  });

  it("returns 400 when nothing editable was sent", async () => {
    signedIn();
    hasPending();
    const res = await PATCH(patchReq({ status: "approved" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("nothing_to_update");
  });

  describe("text and links", () => {
    it("trims the bio, turns a blank into null and coerces a scheme-less website to https", async () => {
      signedIn();
      hasPending();
      await PATCH(patchReq({ bio: "  hello  ", website_url: "yourministry.org" }));
      expect(written()).toEqual({ bio: "hello", website_url: "https://yourministry.org/" });

      signedIn();
      hasPending();
      await PATCH(patchReq({ bio: "   ", website_url: "" }));
      expect(written()).toEqual({ bio: null, website_url: null });
    });

    it.each(["javascript:alert(1)", "data:text/html,<script>1</script>", "vbscript:x"])(
      "refuses a dangerous website scheme (%s) and writes nothing",
      async (website_url) => {
        signedIn();
        hasPending();
        const res = await PATCH(patchReq({ bio: "ok", website_url }));
        expect(res.status).toBe(400);
        expect(adminClient.from).not.toHaveBeenCalled();
      },
    );

    it("keeps a social handle as typed and refuses a display name with spaces or a dangerous scheme", async () => {
      signedIn();
      hasPending();
      await PATCH(patchReq({ instagram_handle: "@gracehub", linkedin_url: "https://linkedin.com/company/grace" }));
      expect(written()).toEqual({
        instagram_handle: "@gracehub",
        linkedin_url: "https://linkedin.com/company/grace",
      });

      for (const bad of [{ facebook_url: "Grace Radio" }, { youtube_url: "javascript:alert(1)" }, { x_handle: 42 }]) {
        signedIn();
        hasPending();
        expect((await PATCH(patchReq(bad))).status).toBe(400);
      }
    });

    it("normalises a South African WhatsApp number to international digits and refuses a non-number", async () => {
      signedIn();
      hasPending();
      await PATCH(patchReq({ whatsapp_number: "071 234 5678" }));
      expect(written()).toEqual({ whatsapp_number: "27712345678" });

      signedIn();
      hasPending();
      expect((await PATCH(patchReq({ whatsapp_number: "call me maybe" }))).status).toBe(400);
    });

    it("validates and lower-cases the public contact email, or clears it", async () => {
      signedIn();
      hasPending();
      await PATCH(patchReq({ contributor_contact_email: " Hello@Grace.Example " }));
      expect(written()).toEqual({ contributor_contact_email: "hello@grace.example" });

      signedIn();
      hasPending();
      await PATCH(patchReq({ contributor_contact_email: "" }));
      expect(written()).toEqual({ contributor_contact_email: null });

      signedIn();
      hasPending();
      expect((await PATCH(patchReq({ contributor_contact_email: "not an email" }))).status).toBe(400);
    });

    it("validates the name and the category", async () => {
      signedIn();
      hasPending();
      await PATCH(patchReq({ display_name: " Grace Hub ", contributor_category: "retreat-healing" }));
      expect(written()).toEqual({ display_name: "Grace Hub", contributor_category: "retreat-healing" });

      signedIn();
      hasPending();
      expect((await PATCH(patchReq({ display_name: "G" }))).status).toBe(400);
      signedIn();
      hasPending();
      // An event-only category is not one of the 12 Contributor types.
      expect((await PATCH(patchReq({ contributor_category: "worship-prayer" }))).status).toBe(400);
    });
  });

  describe("images (logo and cover photos must be https)", () => {
    it("accepts an https logo, clears on blank, refuses http and script schemes", async () => {
      signedIn();
      hasPending();
      await PATCH(patchReq({ logo_url: "https://cdn.grace.example/logo.png" }));
      expect(written()).toEqual({ logo_url: "https://cdn.grace.example/logo.png" });

      signedIn();
      hasPending();
      await PATCH(patchReq({ logo_url: "" }));
      expect(written()).toEqual({ logo_url: null });

      for (const logo_url of ["http://cdn.grace.example/logo.png", "javascript:alert(1)", "//evil.example/x.png", 42]) {
        signedIn();
        hasPending();
        expect((await PATCH(patchReq({ logo_url }))).status).toBe(400);
      }
    });

    it("stores cover photos as [{url, caption}] and accepts bare URLs", async () => {
      signedIn();
      hasPending();
      await PATCH(
        patchReq({
          cover_photo_urls: [
            "https://cdn.grace.example/a.jpg",
            { url: "https://cdn.grace.example/b.jpg", caption: "  Sunday service  " },
          ],
        }),
      );
      expect(written()).toEqual({
        cover_photo_urls: [
          { url: "https://cdn.grace.example/a.jpg", caption: null },
          { url: "https://cdn.grace.example/b.jpg", caption: "Sunday service" },
        ],
      });
    });

    it("refuses more than five covers, a non-array, and any non-https entry", async () => {
      const six = Array.from({ length: 6 }, (_, i) => `https://cdn.grace.example/${i}.jpg`);
      for (const cover_photo_urls of [
        six,
        "https://cdn.grace.example/a.jpg",
        ["http://cdn.grace.example/a.jpg"],
        ["https://cdn.grace.example/a.jpg", "javascript:alert(1)"],
        [{ caption: "no url" }],
        [null],
      ]) {
        signedIn();
        hasPending();
        expect((await PATCH(patchReq({ cover_photo_urls }))).status).toBe(400);
      }
      expect(adminClient.from).not.toHaveBeenCalled();
    });
  });

  describe("location", () => {
    it("stores an address with a complete pin", async () => {
      signedIn();
      hasPending();
      await PATCH(patchReq({ physical_address: "1 Church Street", physical_latitude: -25.7479, physical_longitude: 28.2293 }));
      expect(written()).toEqual({
        physical_address: "1 Church Street",
        physical_latitude: -25.7479,
        physical_longitude: 28.2293,
      });
    });

    it("never keeps half a pin", async () => {
      signedIn();
      hasPending();
      await PATCH(patchReq({ physical_latitude: -25.7479 }));
      expect(written()).toEqual({ physical_latitude: null, physical_longitude: null });
    });

    it("'no fixed location' clears the address and the pin whatever else was sent", async () => {
      signedIn();
      hasPending();
      await PATCH(
        patchReq({ no_fixed_location: true, physical_address: "1 Church Street", physical_latitude: -25.7, physical_longitude: 28.2 }),
      );
      expect(written()).toEqual({
        no_fixed_location: true,
        physical_address: null,
        physical_latitude: null,
        physical_longitude: null,
      });
    });

    it("refuses out-of-range or non-numeric coordinates and a non-boolean flag", async () => {
      for (const bad of [
        { physical_latitude: 91, physical_longitude: 28 },
        { physical_latitude: -25, physical_longitude: 181 },
        { physical_latitude: "-25.7", physical_longitude: 28 },
        { no_fixed_location: "yes" },
      ]) {
        signedIn();
        hasPending();
        expect((await PATCH(patchReq(bad))).status).toBe(400);
      }
      expect(adminClient.from).not.toHaveBeenCalled();
    });
  });
});
