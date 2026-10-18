/**
 * Convince, the data side (`src/frontend/app/convince-lib.jsx`, FEAT-04).
 *
 * The browser reads ONE database function and calls ONE API route; the database and the route decide who may be nudged
 * (docs/audit/probes/friends_considering.probe.sql, 41 checks, against the live objects). What this file pins down is what the app
 * SENDS (the exact function name, argument name, URL, method and body: a typo is a silent "function not found"), that every status
 * becomes plain words, that the server's own wording is never shown, and that a refusal never names its reason.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Friend = { id: string; name: string; photo: string; nudged: boolean };
type Out = { ok: boolean; state?: string; reason?: string; message?: string };
type Api = {
  MAX_FRIENDS: number;
  COPY: Record<string, string | ((name: string) => string)>;
  nameOf: (f: unknown) => string;
  previewLine: (sender: unknown, title: unknown) => string;
  eligibleEvent: (ev: unknown) => boolean;
  friendsConsidering: (sb: unknown, ev: unknown) => Promise<{ ok: boolean; friends: Friend[] }>;
  send: (fetcher: unknown, ev: string, to: string) => Promise<Out>;
  withdraw: (fetcher: unknown, ev: string, to: string) => Promise<Out>;
};
const EV = "11111111-1111-4111-8111-111111111111";
const F1 = "22222222-2222-4222-8222-222222222222";
const F2 = "33333333-3333-4333-8333-333333333333";

let C: Api;
let win: Record<string, unknown>;
beforeAll(() => {
  win = { DATA: { isPastEvent: (e: { past?: boolean }) => !!e.past } };
  C = loadFrontend("convince-lib.jsx", win).CCConvince as Api;
});

function fakeSb(answer: { data?: unknown; error?: unknown; throws?: boolean } = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    sb: {
      rpc(fn: string, args: unknown) {
        calls.push({ fn, args });
        if (answer.throws) return Promise.reject(new Error("offline"));
        return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null });
      },
    },
  };
}
function fakeFetch(status: number | "throw", body: Record<string, unknown> = {}) {
  const calls: { path: string; init: { method: string; body: string } }[] = [];
  const fetcher = (path: string, init: { method: string; body: string }) => {
    calls.push({ path, init });
    if (status === "throw") return Promise.reject(new Error("offline"));
    return Promise.resolve({ status, ok: status < 400, json: () => Promise.resolve(body) });
  };
  return { fetcher, calls };
}

describe("what the app asks the database", () => {
  it("calls friends_considering_event with p_event, and nothing else", async () => {
    const f = fakeSb({ data: [] });
    await C.friendsConsidering(f.sb, EV);
    expect(f.calls).toEqual([{ fn: "friends_considering_event", args: { p_event: EV } }]);
  });
  it("maps the four columns and nothing more, trimming the name", async () => {
    const f = fakeSb({ data: [{ id: F1, full_name: "  Ann Probe ", avatar_url: "https://img.example/a.jpg", nudged: true, secret: "x" }] });
    expect(await C.friendsConsidering(f.sb, EV)).toEqual({ ok: true, friends: [{ id: F1, name: "Ann Probe", photo: "https://img.example/a.jpg", nudged: true }] });
  });
  it("keeps the database's order (it sorts by name; the app never re-ranks)", async () => {
    const f = fakeSb({ data: [{ id: F2, full_name: "Ann", avatar_url: null, nudged: false }, { id: F1, full_name: "Bea", avatar_url: null, nudged: false }] });
    const out = await C.friendsConsidering(f.sb, EV);
    expect(out.friends.map((x) => x.name)).toEqual(["Ann", "Bea"]);
  });
  it("drops a row without a real id, a non-http avatar and anything but true as nudged", async () => {
    const f = fakeSb({ data: [
      { id: "not-a-uuid", full_name: "Bad", avatar_url: null, nudged: false },
      null,
      { id: F1, full_name: null, avatar_url: "javascript:alert(1)", nudged: "yes" },
    ] });
    expect(await C.friendsConsidering(f.sb, EV)).toEqual({ ok: true, friends: [{ id: F1, name: "", photo: "", nudged: false }] });
  });
  it("never shows more than the database's own cap", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ id: `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`, full_name: "P" + i, avatar_url: null, nudged: false }));
    const out = await C.friendsConsidering(fakeSb({ data: rows }).sb, EV);
    expect(out.friends).toHaveLength(C.MAX_FRIENDS);
    expect(C.MAX_FRIENDS).toBe(50);
  });
  it("an error, a missing function, a null answer, a thrown request and a missing client all give an empty, quiet result", async () => {
    for (const sb of [fakeSb({ error: { code: "PGRST202", message: "Could not find the function" } }).sb, fakeSb({ data: null }).sb, fakeSb({ data: { not: "a list" } }).sb, fakeSb({ throws: true }).sb, null]) {
      expect(await C.friendsConsidering(sb, EV)).toEqual({ ok: false, friends: [] });
    }
  });
  it("does not even ask for a junk event id", async () => {
    const f = fakeSb({ data: [] });
    for (const bad of ["e3", "", undefined, 7, "../x"]) expect(await C.friendsConsidering(f.sb, bad)).toEqual({ ok: false, friends: [] });
    expect(f.calls).toEqual([]);
  });
});

describe("what the app sends to /api/convince", () => {
  it("send: a POST with exactly event_id and to_user_id", async () => {
    const f = fakeFetch(201);
    expect(await C.send(f.fetcher, EV, F1)).toEqual({ ok: true, state: "sent" });
    expect(f.calls).toEqual([{ path: "/api/convince", init: { method: "POST", body: JSON.stringify({ event_id: EV, to_user_id: F1 }) } }]);
  });
  it("withdraw: a DELETE with exactly event_id and to_user_id", async () => {
    const f = fakeFetch(200);
    expect(await C.withdraw(f.fetcher, EV, F1)).toEqual({ ok: true });
    expect(f.calls).toEqual([{ path: "/api/convince", init: { method: "DELETE", body: JSON.stringify({ event_id: EV, to_user_id: F1 }) } }]);
  });
});

describe("every answer is plain words", () => {
  it("201 is sent; 409 (already nudged) is a good state, not an error", async () => {
    expect(await C.send(fakeFetch(201).fetcher, EV, F1)).toMatchObject({ ok: true, state: "sent" });
    expect(await C.send(fakeFetch(409, { error: "Already convinced", code: "already" }).fetcher, EV, F1)).toMatchObject({ ok: true, state: "already" });
  });
  it("403 is one neutral sentence that does not name a block, a hidden friend or a reason", async () => {
    const out = await C.send(fakeFetch(403, { error: "Not allowed — you can only nudge a friend who is considering an upcoming event", code: "forbidden" }).fetcher, EV, F1);
    expect(out).toMatchObject({ ok: false, reason: "refused", message: "That nudge cannot be sent right now." });
    expect(out.message).not.toMatch(/block|hidden|considering|friend|follow|private/i);
  });
  it("429 asks for a moment; 401 asks to sign in; anything else, and no answer at all, is the generic sentence", async () => {
    expect(await C.send(fakeFetch(429).fetcher, EV, F1)).toMatchObject({ ok: false, reason: "rate_limited", message: "That is a lot of nudges at once. Please try again in a moment." });
    expect(await C.send(fakeFetch(401).fetcher, EV, F1)).toMatchObject({ ok: false, reason: "signed_out", message: "Please sign in first." });
    for (const status of [400, 404, 500, 503] as const) expect(await C.send(fakeFetch(status).fetcher, EV, F1)).toMatchObject({ ok: false, message: "Something went wrong. Please try again." });
    expect(await C.send(fakeFetch("throw").fetcher, EV, F1)).toMatchObject({ ok: false, reason: "network", message: "Something went wrong. Please try again." });
    expect(await C.send(undefined, EV, F1)).toMatchObject({ ok: false, reason: "network" });
  });
  it("the server's own wording is never passed through", async () => {
    for (const status of [400, 403, 429, 500] as const) {
      const out = await C.send(fakeFetch(status, { error: "SECRET-SERVER-TEXT" }).fetcher, EV, F1);
      expect(out.message).not.toContain("SECRET");
    }
    const w = await C.withdraw(fakeFetch(500, { error: "SECRET-SERVER-TEXT" }).fetcher, EV, F1);
    expect(w.message).not.toContain("SECRET");
  });
  it("withdraw: 200 ok; 429, 401, 500 and a thrown request each say something calm", async () => {
    expect(await C.withdraw(fakeFetch(200).fetcher, EV, F1)).toEqual({ ok: true });
    expect(await C.withdraw(fakeFetch(429).fetcher, EV, F1)).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(await C.withdraw(fakeFetch(401).fetcher, EV, F1)).toMatchObject({ ok: false, reason: "signed_out" });
    expect(await C.withdraw(fakeFetch(500).fetcher, EV, F1)).toMatchObject({ ok: false, message: "Something went wrong. Please try again." });
    expect(await C.withdraw(fakeFetch("throw").fetcher, EV, F1)).toMatchObject({ ok: false, reason: "network" });
  });
  it("the success sentences name the friend, and the withdrawal is honest that a seen note stays", () => {
    expect((C.COPY.sent as (n: string) => string)("Ann")).toBe("Nudge sent to Ann.");
    expect((C.COPY.already as (n: string) => string)("Ann")).toBe("You have already nudged Ann about this event.");
    expect(C.COPY.withdrawn).toMatch(/already saw stays in their notifications/);
  });
});

describe("small helpers", () => {
  it("nameOf: the name, or a plain word for a blank one", () => {
    expect(C.nameOf({ name: "Ann" })).toBe("Ann");
    expect(C.nameOf({ name: "   " })).toBe("A friend");
    expect(C.nameOf({})).toBe("A friend");
    expect(C.nameOf(null)).toBe("A friend");
  });
  it("previewLine is the notification text the database writes, and a sender with no name reads as Someone", () => {
    expect(C.previewLine("Sam", "Night of Worship")).toBe("Sam thinks you should go to Night of Worship");
    expect(C.previewLine("", "Night of Worship")).toBe("Someone thinks you should go to Night of Worship");
    expect(C.previewLine("   ", "X")).toBe("Someone thinks you should go to X");
    expect(C.previewLine(undefined, undefined)).toBe("Someone thinks you should go to this event");
  });
  it("eligibleEvent: a real, upcoming, not cancelled event only", () => {
    expect(C.eligibleEvent({ id: EV })).toBe(true);
    expect(C.eligibleEvent({ id: EV, status: "published" })).toBe(true);
    expect(C.eligibleEvent({ id: EV, status: "cancelled" })).toBe(false);
    expect(C.eligibleEvent({ id: EV, past: true })).toBe(false);
    expect(C.eligibleEvent({ id: "e3" })).toBe(false);
    expect(C.eligibleEvent({})).toBe(false);
    expect(C.eligibleEvent(null)).toBe(false);
  });
});
