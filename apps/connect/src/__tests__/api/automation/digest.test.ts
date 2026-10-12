import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeTables, type Row } from "../../helpers/fake-tables";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const fake = createFakeTables(["profiles", "listing_suggestions"]);
const state = fake.state as { profiles: Row[]; listing_suggestions: Row[] };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ from: (table: string) => fake.from(table) })) }));

const gate = vi.fn();
vi.mock("@/lib/v1Gate", () => ({ gateV1: (...a: unknown[]) => gate(...a) }));

const sendEmail = vi.fn();
vi.mock("@/lib/email/send", async (orig) => ({ ...(await orig<object>()), sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const { POST } = await import("@/app/api/automation/digest/route");

const KEY = { id: "key-1", owner_id: "admin-1", scopes: ["automation:digest"], rate_limit_per_minute: null, raw_prefix: "cck_live_abcd1234" };
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const req = () => new Request("https://connect.example/api/automation/digest", { method: "POST", headers: { Authorization: "Bearer cck_live_x" } });

const profile = (over: Row = {}) => ({
  id: A,
  full_name: "Grace Fellowship",
  email: "office@grace.example",
  notification_email: null,
  role: "contributor",
  contributor_status: "approved",
  contributor_hidden: false,
  deleted_at: null,
  auto_update_level: "suggest",
  auto_update_nudged_at: null,
  notification_prefs: { contributor_updates: true },
  ...over,
});
const pending = (contributor_id = A, hours = 2, over: Row = {}) => ({ contributor_id, status: "pending", created_at: ago(hours), payload: { title: "SECRET-TITLE" }, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  gate.mockResolvedValue({ key: KEY, identifier: "key:1" });
  sendEmail.mockResolvedValue("sent");
  state.profiles = [profile()];
  state.listing_suggestions = [pending()];
});

describe("POST /api/automation/digest: who may call it", () => {
  it("401 with no key, 403 without the automation:digest scope; nothing is sent", async () => {
    gate.mockResolvedValue({ key: null, identifier: "ip" });
    expect((await POST(req())).status).toBe(401);
    gate.mockResolvedValue({ key: { ...KEY, scopes: ["automation:suggest"] }, identifier: "key:1" });
    expect((await POST(req())).status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("passes a rate-limit refusal straight through", async () => {
    const { NextResponse } = await import("next/server");
    gate.mockResolvedValue({ key: null, deny: NextResponse.json({ error: "Too many requests" }, { status: 429 }), identifier: "ip" });
    expect((await POST(req())).status).toBe(429);
  });
});

describe("POST /api/automation/digest: the email", () => {
  it("emails an eligible Contributor once, with the count and a link to the Suggestions tab, and stamps the nudge", async () => {
    state.listing_suggestions = [pending(A, 2), pending(A, 3), pending(A, 5)];
    const res = await POST(req());
    expect(await res.json()).toEqual({ considered: 1, sent: 1, failed: 0, skipped: {} });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0] as { to: string; subject: string; html: string; text: string };
    expect(mail.to).toBe("office@grace.example");
    expect(mail.subject).toBe("Grace Fellowship has 3 new suggested updates on Citizens Connect");
    expect(mail.html).toContain("https://connect.example/dashboard/suggestions");
    expect(mail.text).toContain("https://connect.example/dashboard/suggestions");
    expect(typeof state.profiles[0].auto_update_nudged_at).toBe("string");
  });

  it("says 'suggested update' for exactly one", async () => {
    await POST(req());
    expect((sendEmail.mock.calls[0][0] as { subject: string }).subject).toBe("Grace Fellowship has 1 new suggested update on Citizens Connect");
  });

  it("never puts the suggestions themselves in the email, and never returns an address", async () => {
    const res = await POST(req());
    const mail = sendEmail.mock.calls[0][0] as { html: string; text: string; subject: string };
    for (const part of [mail.html, mail.text, mail.subject]) expect(part).not.toContain("SECRET-TITLE");
    expect(JSON.stringify(await res.json())).not.toMatch(/@|grace\.example/);
  });

  it("escapes the Contributor's name in the HTML and keeps a hostile name on one line in the subject", async () => {
    state.profiles = [profile({ full_name: "<img src=x onerror=1>\r\nBcc: x@evil.example" })];
    await POST(req());
    const mail = sendEmail.mock.calls[0][0] as { html: string; subject: string };
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it("uses the notification address when there is one", async () => {
    state.profiles = [profile({ notification_email: "alerts@grace.example" })];
    await POST(req());
    expect((sendEmail.mock.calls[0][0] as { to: string }).to).toBe("alerts@grace.example");
  });

  it("counts only suggestions created since the last nudge", async () => {
    state.profiles = [profile({ auto_update_nudged_at: ago(30) })];
    state.listing_suggestions = [pending(A, 40), pending(A, 29), pending(A, 5)];
    await POST(req());
    expect((sendEmail.mock.calls[0][0] as { subject: string }).subject).toContain("has 2 new suggested updates");
  });
});

describe("POST /api/automation/digest: who is NOT emailed", () => {
  const cases: [string, Row, string][] = [
    ["automation is off", { auto_update_level: "off" }, "automation_off"],
    ["the level is not a known one", { auto_update_level: "yes" }, "automation_off"],
    ["the listing is hidden", { contributor_hidden: true }, "not_eligible"],
    ["the listing is deleted", { deleted_at: "2026-01-01T00:00:00Z" }, "not_eligible"],
    ["not approved", { contributor_status: "pending" }, "not_eligible"],
    ["not a Contributor", { role: "citizen" }, "not_eligible"],
    ["they switched off contributor updates", { notification_prefs: { contributor_updates: false } }, "opted_out"],
    ["they were nudged less than 20 hours ago", { auto_update_nudged_at: ago(5) }, "too_soon"],
    ["everything pending is older than the last nudge", { auto_update_nudged_at: ago(25) }, "nothing_new"],
  ];
  for (const [why, over, reason] of cases) {
    it(`not when ${why}`, async () => {
      state.profiles = [profile(over)];
      state.listing_suggestions = [pending(A, why.includes("older") ? 30 : 2)];
      const res = await POST(req());
      expect(sendEmail).not.toHaveBeenCalled();
      expect((await res.json()).skipped).toEqual({ [reason]: 1 });
      expect(state.profiles[0].auto_update_nudged_at ?? null).toBe(over.auto_update_nudged_at ?? null);
    });
  }

  it("not for an automatically published event alone: only PENDING suggestions count", async () => {
    state.listing_suggestions = [pending(A, 2, { status: "auto_published" }), pending(A, 2, { status: "dismissed" }), pending(A, 2, { status: "published" })];
    const res = await POST(req());
    expect(await res.json()).toEqual({ considered: 0, sent: 0, failed: 0, skipped: {} });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a notification preference that was never set still gets the email (the default is on)", async () => {
    state.profiles = [profile({ notification_prefs: null })];
    await POST(req());
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/automation/digest: one run, several Contributors, and failures", () => {
  it("handles each Contributor on their own", async () => {
    state.profiles = [profile(), profile({ id: B, full_name: "Other Org", email: "o@other.example", auto_update_level: "off" })];
    state.listing_suggestions = [pending(A, 2), pending(B, 2)];
    const res = await POST(req());
    expect(await res.json()).toEqual({ considered: 2, sent: 1, failed: 0, skipped: { automation_off: 1 } });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("a failed send is counted, not stamped (the next run retries), and does not stop the others", async () => {
    state.profiles = [profile(), profile({ id: B, full_name: "Other Org", email: "o@other.example" })];
    state.listing_suggestions = [pending(A, 2), pending(B, 2)];
    sendEmail.mockResolvedValueOnce("failed").mockResolvedValueOnce("sent");
    const res = await POST(req());
    expect(await res.json()).toEqual({ considered: 2, sent: 1, failed: 1, skipped: {} });
    expect(state.profiles[0].auto_update_nudged_at).toBe(null);
    expect(typeof state.profiles[1].auto_update_nudged_at).toBe("string");
  });

  it("'skipped' (no mailer configured) is not stamped either", async () => {
    sendEmail.mockResolvedValue("skipped");
    const res = await POST(req());
    expect((await res.json()).skipped).toEqual({ not_sent: 1 });
    expect(state.profiles[0].auto_update_nudged_at).toBe(null);
  });

  it("running it twice in a row sends once", async () => {
    await POST(req());
    sendEmail.mockClear();
    const second = await POST(req());
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await second.json()).skipped).toEqual({ too_soon: 1 });
  });
});
