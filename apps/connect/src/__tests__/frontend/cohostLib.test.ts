/**
 * Co-hosted events (`src/frontend/app/cohost-lib.jsx`, tracker P2-09, migration 184): the data side.
 *
 * The browser calls three SECURITY DEFINER functions with the signed-in client; the database checks who is asking
 * (docs/audit/probes/184_event_cohosts.probe.sql, 39 checks, against the live objects). What this file pins down is what the
 * app SENDS (the exact function names and argument names, since a typo is a silent "function not found"), that a refusal is
 * an answer in plain words and not a crash, that a hidden or blocked person is never named as such, and the small reads.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Res = { ok: boolean; status?: string | null; reason?: string; message?: string };
type Api = {
  MAX: number;
  reasonText: (r: string) => string;
  invite: (sb: unknown, ev: string, c: string) => Promise<Res>;
  respond: (sb: unknown, ev: string, accept: boolean) => Promise<Res>;
  remove: (sb: unknown, ev: string, c: string) => Promise<Res>;
  listForEvent: (sb: unknown, ev: string) => Promise<{ contributorId: string; status: string }[]>;
  myInvitations: (sb: unknown, uid: string) => Promise<Map<string, string>>;
  isHostOf: (ev: unknown, id: string) => boolean;
};
let C: Api;
beforeAll(() => {
  C = loadFrontend("cohost-lib.jsx").CCCohosts as Api;
});

function fake(answer: { data?: unknown; error?: unknown } = {}) {
  const rpcs: { fn: string; args: unknown }[] = [];
  const froms: { table: string; select?: string; eq: [string, unknown][] }[] = [];
  const sb = {
    rpc(fn: string, args: unknown) { rpcs.push({ fn, args }); return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }); },
    from(table: string) {
      const call = { table, eq: [] as [string, unknown][] } as (typeof froms)[number];
      froms.push(call);
      const chain: Record<string, unknown> = {
        select(cols: string) { call.select = cols; return chain; },
        eq(col: string, val: unknown) { call.eq.push([col, val]); return Object.assign(chain, { then: (res: (v: unknown) => unknown) => res({ data: answer.data ?? null, error: answer.error ?? null }) }); },
      };
      return chain;
    },
  };
  return { sb, rpcs, froms };
}

describe("what the app sends", () => {
  it("invite: the exact function and argument names", async () => {
    const f = fake({ data: { success: true } });
    expect(await C.invite(f.sb, "ev1", "c1")).toEqual({ ok: true, status: null });
    expect(f.rpcs).toEqual([{ fn: "invite_event_cohost", args: { p_event_id: "ev1", p_contributor_id: "c1" } }]);
  });
  it("respond: accept and decline are a real boolean, whatever the caller passed", async () => {
    const a = fake({ data: { success: true, status: "accepted" } });
    expect(await C.respond(a.sb, "ev1", true)).toEqual({ ok: true, status: "accepted" });
    expect(a.rpcs).toEqual([{ fn: "respond_event_cohost", args: { p_event_id: "ev1", p_accept: true } }]);
    const d = fake({ data: { success: true, status: "declined" } });
    await C.respond(d.sb, "ev1", 0 as unknown as boolean);
    expect(d.rpcs[0].args).toEqual({ p_event_id: "ev1", p_accept: false });
  });
  it("remove: the exact function and argument names", async () => {
    const f = fake({ data: { success: true } });
    await C.remove(f.sb, "ev1", "c1");
    expect(f.rpcs).toEqual([{ fn: "remove_event_cohost", args: { p_event_id: "ev1", p_contributor_id: "c1" } }]);
  });
});

describe("a refusal is an answer in plain words", () => {
  const reasons = ["not_authenticated", "cannot_cohost_self", "not_event_owner", "not_a_contributor", "not_allowed", "too_many_cohosts", "already_invited", "no_open_invitation", "not_found"];
  it.each(reasons)("%s has its own sentence and the call resolves instead of throwing", async (reason) => {
    const out = await C.invite(fake({ data: { success: false, reason } }).sb, "ev1", "c1");
    expect(out).toMatchObject({ ok: false, reason });
    expect(out.message).toBe(C.reasonText(reason));
    expect(out.message).not.toMatch(/Something went wrong/);
    expect(out.message!.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
  it("all the sentences are different (no two reasons read the same)", () => {
    expect(new Set(reasons.map(C.reasonText)).size).toBe(reasons.length);
  });
  it("a hidden or blocked person is never named as such", () => {
    expect(C.reasonText("not_allowed")).not.toMatch(/block|hidden/i);
    expect(C.reasonText("not_a_contributor")).not.toMatch(/block|hidden/i);
  });
  it("the ceiling in the sentence is the real ceiling", () => {
    expect(C.MAX).toBe(3);
    expect(C.reasonText("too_many_cohosts")).toContain("3");
  });
  it("an unknown reason, a transport error and a null answer all give the generic sentence", async () => {
    for (const f of [fake({ data: { success: false, reason: "brand_new_reason" } }), fake({ error: { message: "boom" } }), fake({ data: null }), fake({ data: "nope" })]) {
      const out = await C.invite(f.sb, "ev1", "c1");
      expect(out.ok).toBe(false);
      expect(out.message).toBe("Something went wrong. Please try again.");
    }
  });
});

describe("reads", () => {
  it("listForEvent asks for one event's rows and maps the columns", async () => {
    const f = fake({ data: [{ contributor_id: "c1", status: "accepted" }, { contributor_id: "c2", status: "invited" }] });
    expect(await C.listForEvent(f.sb, "ev1")).toEqual([{ contributorId: "c1", status: "accepted" }, { contributorId: "c2", status: "invited" }]);
    expect(f.froms[0]).toMatchObject({ table: "event_cohosts", select: "contributor_id,status", eq: [["event_id", "ev1"]] });
  });
  it("listForEvent throws on a failed read, and an empty answer is an empty list", async () => {
    await expect(C.listForEvent(fake({ error: { message: "x" } }).sb, "ev1")).rejects.toBeTruthy();
    expect(await C.listForEvent(fake({ data: null }).sb, "ev1")).toEqual([]);
  });
  it("myInvitations asks only for the signed-in person's rows and returns eventId -> status", async () => {
    const f = fake({ data: [{ event_id: "e1", status: "invited" }, { event_id: "e2", status: "accepted" }] });
    const m = await C.myInvitations(f.sb, "me");
    expect(m.get("e1")).toBe("invited");
    expect(m.get("e2")).toBe("accepted");
    expect(m.get("e3")).toBeUndefined();
    expect(f.froms[0]).toMatchObject({ table: "event_cohosts", select: "event_id,status", eq: [["contributor_id", "me"]] });
  });
});

describe("isHostOf", () => {
  const ev = { organizerId: "org", coHostIds: ["co1", "co2"] };
  it("the organiser and an accepted co-host are hosts; anyone else is not", () => {
    expect(C.isHostOf(ev, "org")).toBe(true);
    expect(C.isHostOf(ev, "co2")).toBe(true);
    expect(C.isHostOf(ev, "other")).toBe(false);
  });
  it("is safe on missing data", () => {
    expect(C.isHostOf(null, "org")).toBe(false);
    expect(C.isHostOf({ organizerId: "org" }, "org")).toBe(true);
    expect(C.isHostOf({ organizerId: "org" }, "co1")).toBe(false);
    expect(C.isHostOf(ev, "")).toBe(false);
  });
});
