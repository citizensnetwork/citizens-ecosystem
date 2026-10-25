import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { signIntake } from "@/lib/intake/googleForm";

const SECRET = "a".repeat(64);

type LedgerRow = { slug: string; status: string; created_at: string; reminder_sent_at: string | null };
let ledger: { data: LedgerRow[] | null; error: unknown } = { data: [], error: null };
const chain = {
  select: vi.fn(() => chain),
  in: vi.fn(() => chain),
  order: vi.fn(async () => ledger),
};
const mockAdmin = { from: vi.fn(() => chain) };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => mockAdmin) }));

const { POST } = await import("@/app/api/intake/google-form/status/route");

function signedReq(body: unknown, opts: { secret?: string; ts?: number; signature?: string | null } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Intake-Timestamp": ts };
  const signature = opts.signature === undefined ? signIntake(opts.secret ?? SECRET, ts, raw) : opts.signature;
  if (signature !== null) headers["X-Intake-Signature"] = signature;
  return new Request("http://localhost/api/intake/google-form/status", { method: "POST", headers, body: raw });
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000 - 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  vi.stubEnv("INTAKE_WEBHOOK_SECRET", SECRET);
  ledger = { data: [], error: null };
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/intake/google-form/status — authentication (same door as the intake)", () => {
  it("fails closed with 503 when the secret isn't configured, and reads nothing", async () => {
    vi.stubEnv("INTAKE_WEBHOOK_SECRET", "");
    const res = await POST(signedReq({ slugs: ["grace"] }));
    expect(res.status).toBe(503);
    expect(mockAdmin.from).not.toHaveBeenCalled();
  });

  it("answers a missing, wrong or stale signature with a bare 401 and reads nothing", async () => {
    for (const req of [
      signedReq({ slugs: ["grace"] }, { signature: null }),
      signedReq({ slugs: ["grace"] }, { secret: "b".repeat(64) }),
      signedReq({ slugs: ["grace"] }, { ts: Math.floor(Date.now() / 1000) - 301 }),
    ]) {
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    expect(mockAdmin.from).not.toHaveBeenCalled();
  });

  it("a body signed for one request cannot be swapped for another", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const signed = signIntake(SECRET, ts, JSON.stringify({ slugs: ["grace"] }));
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "X-Intake-Timestamp": ts, "X-Intake-Signature": signed },
        body: JSON.stringify({ slugs: ["someone-else"] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("is rate limited per caller", async () => {
    let limited = false;
    for (let i = 0; i < 40 && !limited; i++) limited = (await POST(signedReq({ slugs: ["grace"] }))).status === 429;
    expect(limited).toBe(true);
  });
});

describe("POST /api/intake/google-form/status — what it answers", () => {
  it("returns each known listing's state and age, and leaves unknown slugs out", async () => {
    ledger = {
      data: [
        { slug: "grace", status: "awaiting", created_at: daysAgo(3), reminder_sent_at: null },
        { slug: "hope", status: "confirmed", created_at: daysAgo(9), reminder_sent_at: daysAgo(2) },
        { slug: "mercy", status: "declined", created_at: daysAgo(1), reminder_sent_at: null },
      ],
      error: null,
    };
    const res = await POST(signedReq({ slugs: ["grace", "hope", "mercy", "old-listing"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      statuses: {
        grace: { status: "awaiting", age_days: 3, reminded: false },
        hope: { status: "confirmed", age_days: 9, reminded: true },
        mercy: { status: "declined", age_days: 1, reminded: false },
      },
    });
    expect(mockAdmin.from).toHaveBeenCalledWith("listing_claims");
    expect(chain.in).toHaveBeenCalledWith("slug", ["grace", "hope", "mercy", "old-listing"]);
  });

  it("never returns an email address, a name or an id", async () => {
    ledger = {
      data: [{ slug: "grace", status: "awaiting", created_at: daysAgo(0), reminder_sent_at: null, claim_email: "o@example.com", placeholder_id: "p" } as LedgerRow],
      error: null,
    };
    const text = JSON.stringify(await (await POST(signedReq({ slugs: ["grace"] }))).json());
    expect(text).not.toContain("@");
    expect(text).not.toContain("placeholder");
    expect(text).not.toContain("claim_email");
  });

  it("selects only the columns it needs", async () => {
    await POST(signedReq({ slugs: ["grace"] }));
    expect(chain.select).toHaveBeenCalledWith("slug, status, created_at, reminder_sent_at");
  });

  it("when a slug appears twice the newest request wins", async () => {
    ledger = {
      data: [
        { slug: "grace", status: "declined", created_at: daysAgo(30), reminder_sent_at: null },
        { slug: "grace", status: "awaiting", created_at: daysAgo(1), reminder_sent_at: null },
      ],
      error: null,
    };
    const body = await (await POST(signedReq({ slugs: ["grace"] }))).json();
    expect(body.statuses.grace.status).toBe("awaiting");
  });

  it("de-duplicates the slugs it asks for", async () => {
    await POST(signedReq({ slugs: ["grace", "grace", "hope"] }));
    expect(chain.in).toHaveBeenCalledWith("slug", ["grace", "hope"]);
  });

  it("500 status_failed when the database read fails", async () => {
    ledger = { data: null, error: { message: "boom" } };
    const res = await POST(signedReq({ slugs: ["grace"] }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "status_failed" });
  });
});

describe("POST /api/intake/google-form/status — input", () => {
  it("accepts up to 200 slugs and no more", async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `listing-${i}`);
    expect((await POST(signedReq({ slugs: many(200) }))).status).toBe(200);
    resetRateLimitStore();
    expect((await POST(signedReq({ slugs: many(201) }))).status).toBe(400);
  });

  it("rejects anything that is not a plain list of listing slugs, before touching the database", async () => {
    const bad: unknown[] = [
      {},
      { slugs: [] },
      { slugs: "grace" },
      { slugs: [1] },
      { slugs: ["Grace"] },
      { slugs: ["-grace"] },
      { slugs: ["gr ace"] },
      { slugs: ["grace'); drop table listing_claims;--"] },
      { slugs: ["a".repeat(121)] },
      { slugs: ["grace", null] },
      [],
      "not json",
    ];
    for (const body of bad) {
      resetRateLimitStore();
      const res = await POST(signedReq(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error).toBe("invalid_slugs");
    }
    expect(mockAdmin.from).not.toHaveBeenCalled();
  });

  it("refuses an oversize body with 413", async () => {
    const res = await POST(signedReq({ slugs: ["grace"], pad: "x".repeat(70_000) }));
    expect(res.status).toBe(413);
  });
});
