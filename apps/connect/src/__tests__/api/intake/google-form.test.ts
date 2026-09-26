import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { MAX_IMAGE_BYTES, signIntake } from "@/lib/intake/googleForm";

const SECRET = "a".repeat(64);
const NEW_USER_ID = "33333333-3333-4333-8333-333333333333";

const storageBucket = {
  upload: vi.fn(),
  getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } })),
  remove: vi.fn().mockResolvedValue({ data: [], error: null }),
};
const mockAdmin = {
  auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn().mockResolvedValue({ error: null }) } },
  storage: { from: vi.fn(() => storageBucket) },
  rpc: vi.fn(),
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => mockAdmin) }));

const { POST } = await import("@/app/api/intake/google-form/route");

const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]).toString("base64");
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]).toString("base64");

/** A row as the Apps Script sends it: raw Form labels. */
const row = {
  owner_email: "daniel@gracepointchurch.org.za",
  organisation_name: "Grace Point Community Church",
  organisation_type: "Church",
  primary_category: "Church",
  fixed_location: "Yes",
  street_address: "18 Oak Avenue, Randpark Ridge, Randburg, Johannesburg",
  maps_link: "https://www.google.com/maps/place/x/@-26.09,27.95,17z/data=!3d-26.0948!4d27.9591",
  bio: "A local Christian community.",
  website: "https://gracepointchurch.org.za",
  contact_email: "hello@gracepointchurch.org.za",
  instagram: "@gracepointchurch",
  facebook: "facebook.com/gracepointchurch",
  x: "@GracePointChurch",
  whatsapp: "https://wa.me/27824567812",
  faith_alignment: true,
  permission_to_publish: true,
};

function signedReq(body: unknown, opts: { secret?: string; ts?: number; signature?: string | null } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Intake-Timestamp": ts };
  const signature = opts.signature === undefined ? signIntake(opts.secret ?? SECRET, ts, raw) : opts.signature;
  if (signature !== null) headers["X-Intake-Signature"] = signature;
  return new Request("http://localhost/api/intake/google-form", { method: "POST", headers, body: raw });
}

const rpcArgs = () => mockAdmin.rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  vi.stubEnv("INTAKE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "mt-key");
  mockAdmin.auth.admin.createUser.mockResolvedValue({ data: { user: { id: NEW_USER_ID } }, error: null });
  mockAdmin.rpc.mockResolvedValue({ data: { success: true, slug: "grace-point-community-church" }, error: null });
  storageBucket.upload.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/intake/google-form — authentication", () => {
  it("fails closed with 503 when the secret isn't configured", async () => {
    vi.stubEnv("INTAKE_WEBHOOK_SECRET", "");
    const res = await POST(signedReq(row));
    expect(res.status).toBe(503);
    expect(mockAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong signature with a bare 401", async () => {
    for (const req of [signedReq(row, { signature: null }), signedReq(row, { secret: "b".repeat(64) })]) {
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    expect(mockAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("rejects a replayed request outside the 5-minute window", async () => {
    const res = await POST(signedReq(row, { ts: Math.floor(Date.now() / 1000) - 301 }));
    expect(res.status).toBe(401);
  });

  it("rejects a signed body that isn't a JSON object", async () => {
    const res = await POST(signedReq("[1,2]"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });
});

describe("POST /api/intake/google-form — validation", () => {
  it("requires both consents", async () => {
    const res = await POST(signedReq({ ...row, permission_to_publish: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("consent_required");
  });

  it("rejects an unknown Organisation Type or Primary category, naming the label", async () => {
    let res = await POST(signedReq({ ...row, organisation_type: "Cooperative" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "unknown_organisation_type", message: expect.stringContaining("Cooperative") });

    res = await POST(signedReq({ ...row, primary_category: "Community Outreach" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_primary_category");
    expect(mockAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("requires the organisation name and a valid owner email", async () => {
    let res = await POST(signedReq({ ...row, organisation_name: "" }));
    expect((await res.json()).error).toBe("display_name_required");
    res = await POST(signedReq({ ...row, owner_email: "nope" }));
    expect((await res.json()).error).toBe("valid_claim_email_required");
  });

  it("rejects a pathological owner email quickly (ReDoS guard)", async () => {
    const evil = "a".repeat(50_000) + "@" + "a".repeat(50_000) + "!";
    const start = Date.now();
    const res = await POST(signedReq({ ...row, owner_email: evil }));
    expect(Date.now() - start).toBeLessThan(1_000);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/intake/google-form — creating the listing", () => {
  it("maps labels, uses the Maps-link pin, and returns the /c/<slug> URL", async () => {
    const res = await POST(signedReq({ ...row, organisation_type: "Christian Nonprofit / Ministry" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      slug: "grace-point-community-church",
      url: "http://localhost/c/grace-point-community-church",
      warnings: [],
    });
    expect(mockAdmin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "daniel@gracepointchurch.org.za", email_confirm: true }),
    );
    expect(mockAdmin.rpc).toHaveBeenCalledWith("intake_create_contributor_profile", expect.anything());
    expect(rpcArgs()).toMatchObject({
      _target_id: NEW_USER_ID,
      _contributor_kind: "organization",
      _contributor_category: "churches-ministries",
      _contact_email: "hello@gracepointchurch.org.za",
      _facebook_url: "https://facebook.com/gracepointchurch",
      _x_handle: "@GracePointChurch",
      _physical_latitude: -26.0948,
      _physical_longitude: 27.9591,
      _no_fixed_location: false,
      _cover_photo_urls: [],
    });
  });

  it("prefers NEXT_PUBLIC_SITE_URL for the listing URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.citizenscentral.co.za/");
    const res = await POST(signedReq(row));
    expect((await res.json()).url).toBe("https://www.citizenscentral.co.za/c/grace-point-community-church");
  });

  it("nulls address and pin for 'No' fixed location, without geocoding", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await POST(signedReq({ ...row, fixed_location: "No" }));
    expect(rpcArgs()).toMatchObject({
      _no_fixed_location: true,
      _physical_address: null,
      _physical_latitude: null,
      _physical_longitude: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to the script's geocode, then MapTiler, then a warning", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ features: [{ center: [28.0, -26.1] }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const addressOnly = { ...row, maps_link: "https://maps.google.com/?q=18+Oak+Avenue" };

    await POST(signedReq({ ...addressOnly, geocoded: { lat: -26.2, lng: 27.9 } }));
    expect(rpcArgs()).toMatchObject({ _physical_latitude: -26.2, _physical_longitude: 27.9 });
    expect(fetchSpy).not.toHaveBeenCalled();

    await POST(signedReq(addressOnly));
    expect(rpcArgs()).toMatchObject({ _physical_latitude: -26.1, _physical_longitude: 28.0 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("api.maptiler.com/geocoding/");

    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    const res = await POST(signedReq(addressOnly));
    expect(res.status).toBe(200);
    expect(rpcArgs()).toMatchObject({ _physical_latitude: null, _physical_longitude: null });
    expect((await res.json()).warnings[0]).toMatch(/No map pin/);
  });

  it("uploads logo + cover under the new user's folder and stores the cover as [{url, caption}]", async () => {
    await POST(signedReq({ ...row, logo: { mime: "image/png", base64: PNG_B64 }, cover: { mime: "image/jpeg", base64: JPEG_B64 } }));
    const paths = storageBucket.upload.mock.calls.map((c) => c[0] as string);
    expect(paths[0]).toMatch(new RegExp(`^${NEW_USER_ID}/intake/logo-[0-9a-f-]{36}\\.png$`));
    expect(paths[1]).toMatch(new RegExp(`^${NEW_USER_ID}/intake/cover-[0-9a-f-]{36}\\.jpg$`));
    expect(storageBucket.upload.mock.calls[1][2]).toMatchObject({ contentType: "image/jpeg", upsert: false });
    expect(rpcArgs()._logo_url).toBe(`https://cdn.test/${paths[0]}`);
    expect(rpcArgs()._cover_photo_urls).toEqual([{ url: `https://cdn.test/${paths[1]}`, caption: null }]);
  });

  it("turns an oversize or unsupported image into a warning, not a failure", async () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0xff).toString("base64");
    const res = await POST(
      signedReq({ ...row, logo: { mime: "image/heic", base64: JPEG_B64 }, cover: { mime: "image/jpeg", base64: big } }),
    );
    expect(res.status).toBe(200);
    const { warnings } = await res.json();
    expect(warnings).toEqual([
      expect.stringMatching(/^Logo skipped: .*JPEG, PNG or WebP/),
      expect.stringMatching(/^Cover photo skipped: .*larger than/),
    ]);
    expect(storageBucket.upload).not.toHaveBeenCalled();
    expect(rpcArgs()).toMatchObject({ _logo_url: null, _cover_photo_urls: [] });
  });

  it("keeps the listing when an upload fails, with a warning", async () => {
    storageBucket.upload.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await POST(signedReq({ ...row, logo: { mime: "image/png", base64: PNG_B64 } }));
    expect(res.status).toBe(200);
    expect((await res.json()).warnings).toEqual([expect.stringMatching(/^Logo upload failed/)]);
    expect(rpcArgs()._logo_url).toBeNull();
  });

  it("returns 409 when the owner email is already registered (idempotent re-approval)", async () => {
    mockAdmin.auth.admin.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });
    const res = await POST(signedReq(row));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("email_already_registered");
    expect(mockAdmin.rpc).not.toHaveBeenCalled();
  });

  it("rolls back the auth user and uploaded images when the profile RPC fails", async () => {
    mockAdmin.rpc.mockResolvedValueOnce({ data: { success: false, reason: "target_not_fresh" }, error: null });
    const res = await POST(signedReq({ ...row, logo: { mime: "image/png", base64: PNG_B64 } }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("target_not_fresh");
    expect(storageBucket.remove).toHaveBeenCalledWith([expect.stringMatching(`^${NEW_USER_ID}/intake/logo-`)]);
    expect(mockAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
  });
});
