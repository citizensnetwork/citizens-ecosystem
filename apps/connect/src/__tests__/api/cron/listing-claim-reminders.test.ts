import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const CRON_SECRET = "c".repeat(48);

type Due = { id: string; placeholder_id: string; slug: string; claim_email: string };
let due: Due[] = [];
let readError: unknown = null;
let stampWins: boolean[] = [];
let profile: { full_name?: string; contributor_hidden?: boolean; deleted_at?: string | null } | null = { full_name: "Grace Outreach", contributor_hidden: false, deleted_at: null };

const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
const filters: Array<[string, string, unknown]> = [];

function table(name: string) {
  const state: { op: "select" | "update"; payload?: Record<string, unknown>; id?: string } = { op: "select" };
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.update = vi.fn((payload: Record<string, unknown>) => { state.op = "update"; state.payload = payload; return chain; });
  chain.eq = vi.fn((col: string, val: unknown) => { filters.push([name, col, val]); if (col === "id") state.id = String(val); return chain; });
  chain.is = vi.fn((col: string, val: unknown) => { filters.push([name, `is:${col}`, val]); return chain; });
  chain.lte = vi.fn((col: string, val: unknown) => { filters.push([name, `lte:${col}`, val]); return chain; });
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(async () => ({ data: due, error: readError }));
  chain.maybeSingle = vi.fn(async () => ({ data: profile, error: null }));
  // an UPDATE ... RETURNING resolves when awaited
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => {
    if (state.op === "update") {
      updates.push({ id: state.id ?? "?", payload: state.payload ?? {} });
      const won = state.payload && "reminder_sent_at" in state.payload && state.payload.reminder_sent_at !== null ? stampWins.shift() ?? true : true;
      return Promise.resolve({ data: won ? [{ id: state.id }] : [], error: null }).then(resolve);
    }
    return Promise.resolve({ data: null, error: null }).then(resolve);
  };
  return chain;
}
const mockAdmin = { from: vi.fn((name: string) => table(name)) };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => mockAdmin) }));

const mockSendEmail = vi.fn();
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const { GET } = await import("@/app/api/cron/listing-claim-reminders/route");

const req = (auth: string | null = `Bearer ${CRON_SECRET}`) =>
  new Request("https://www.citizenscentral.co.za/api/cron/listing-claim-reminders", { headers: auth === null ? {} : { authorization: auth } });

beforeEach(() => {
  vi.clearAllMocks();
  due = [{ id: "c1", placeholder_id: "p1", slug: "grace-outreach", claim_email: "owner@example.com" }];
  readError = null;
  stampWins = [];
  profile = { full_name: "Grace Outreach", contributor_hidden: false, deleted_at: null };
  updates.length = 0;
  filters.length = 0;
  mockSendEmail.mockResolvedValue("sent");
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.citizenscentral.co.za");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/listing-claim-reminders — who may call it", () => {
  it("fails closed with 503 when CRON_SECRET is missing or short, and touches nothing", async () => {
    for (const v of ["", "short"]) {
      vi.stubEnv("CRON_SECRET", v);
      expect((await GET(req())).status).toBe(503);
    }
    expect(mockAdmin.from).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("a missing, wrong, or differently-sized bearer is a bare 401", async () => {
    for (const a of [null, "", "Bearer ", `Bearer ${"d".repeat(48)}`, `Bearer ${CRON_SECRET}x`, CRON_SECRET.slice(1), "Basic abc"]) {
      const res = await GET(req(a));
      expect(res.status, String(a)).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    expect(mockAdmin.from).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/listing-claim-reminders — the one reminder", () => {
  it("emails each owner who has not answered after 7 days, once, to their real address", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ due: 1, sent: 1, skipped: 0, failed: 0 });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const mail = mockSendEmail.mock.calls[0][0] as { to: string; subject: string; text: string; html: string };
    expect(mail.to).toBe("owner@example.com");
    expect(mail.subject).toContain("Grace Outreach");
    expect(mail.text).toContain("https://www.citizenscentral.co.za/c/grace-outreach");
    expect(mail.text).toContain("https://www.citizenscentral.co.za/dashboard");
    expect(mail.text).toContain("this is the only reminder we will send");
    expect(mail.text).toContain("Nothing happens to your account unless you confirm");
  });

  it("asks only for awaiting rows that were never reminded and are at least 7 days old", async () => {
    const before = Date.now();
    await GET(req());
    expect(filters).toContainEqual(["listing_claims", "status", "awaiting"]);
    expect(filters).toContainEqual(["listing_claims", "is:reminder_sent_at", null]);
    const cutoff = filters.find((f) => f[1] === "lte:created_at")?.[2] as string;
    const ageMs = before - Date.parse(cutoff);
    expect(Math.abs(ageMs - 7 * 86_400_000)).toBeLessThan(5_000);
  });

  it("takes the stamp BEFORE it sends, and only the run that wins the stamp sends (two overlapping runs mail once)", async () => {
    stampWins = [false];
    const res = await GET(req());
    expect(await res.json()).toMatchObject({ due: 1, sent: 0 });
    expect(mockSendEmail).not.toHaveBeenCalled();
    // the conditional update repeated the guards, so a lost race cannot stamp over a later state
    expect(filters).toContainEqual(["listing_claims", "id", "c1"]);
    expect(updates[0].payload.reminder_sent_at).toEqual(expect.any(String));
  });

  it("clears the stamp when the email could not be sent, so tomorrow tries again", async () => {
    mockSendEmail.mockResolvedValueOnce("failed");
    expect(await (await GET(req())).json()).toEqual({ due: 1, sent: 0, skipped: 0, failed: 1 });
    expect(updates.map((u) => u.payload.reminder_sent_at === null)).toEqual([false, true]);
  });

  it("also clears the stamp when no mail key is configured ('skipped')", async () => {
    mockSendEmail.mockResolvedValueOnce("skipped");
    expect(await (await GET(req())).json()).toEqual({ due: 1, sent: 0, skipped: 1, failed: 0 });
    expect(updates.at(-1)?.payload.reminder_sent_at).toBeNull();
  });

  it("does not remind about a listing an admin has since hidden or removed (and leaves it stamped)", async () => {
    for (const p of [{ full_name: "X", contributor_hidden: true }, { full_name: "X", deleted_at: "2026-10-01" }, null]) {
      profile = p;
      mockSendEmail.mockClear();
      updates.length = 0;
      const json = await (await GET(req())).json();
      expect(json).toMatchObject({ sent: 0, skipped: 1 });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(updates.every((u) => u.payload.reminder_sent_at !== null)).toBe(true);
    }
  });

  it("changes nothing but the reminder stamp: no listing, account or status is written", async () => {
    await GET(req());
    for (const u of updates) expect(Object.keys(u.payload)).toEqual(["reminder_sent_at"]);
  });

  it("an empty day is a clean 200", async () => {
    due = [];
    expect(await (await GET(req())).json()).toEqual({ due: 0, sent: 0, skipped: 0, failed: 0 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("500 read_failed when the ledger cannot be read", async () => {
    readError = { message: "boom" };
    due = [];
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "read_failed" });
  });

  it("escapes a hostile listing name in the reminder's HTML", async () => {
    profile = { full_name: '<script>alert("x")</script>', contributor_hidden: false };
    await GET(req());
    const mail = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
