/**
 * Moments (`src/frontend/app/moments-lib.jsx`, tracker P2-05 adapted, migration 188): the data side of a short note that
 * clears itself after a day. The browser calls these with the SIGNED-IN Supabase client, so row-level security is the wall
 * (proved against the live table by docs/audit/probes/188_moments.probe.sql). What this file pins down is what the app
 * SENDS and how it reads an answer: the author's id and exactly the three columns the person chose, no expiry (the database
 * sets it), what is refused before any request, the 5-note ceiling as a message, and any other failure thrown.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Err = { code?: string; message?: string } | null;
type Moment = { id: string; body: string; image_url: string | null; created_at: string; expires_at: string };
type Api = {
  MAX_CHARS: number;
  MAX_LIVE: number;
  clean: (t: unknown) => string;
  size: (t: unknown) => number;
  check: (t: unknown) => "ok" | "empty" | "too_long";
  live: (list: unknown, now?: number) => Moment[];
  listMine: (sb: unknown, uid: string, nowIso?: string) => Promise<Moment[]>;
  post: (sb: unknown, uid: string, text: string, image?: string) => Promise<{ status: string; moment?: Moment }>;
  takeDown: (sb: unknown, id: string) => Promise<void>;
};
let M: Api;
beforeAll(() => {
  M = loadFrontend("moments-lib.jsx").CCMoments as Api;
});

/** A stand-in for the supabase-js query builder that records every call and answers with what the test says. */
function fake(answer: { data?: unknown; error?: Err } = {}) {
  const calls: { table?: string; op?: string; payload?: unknown; select?: string; eq: [string, unknown][]; gt: [string, unknown][]; order?: [string, unknown] }[] = [];
  const result = () => ({ data: answer.data ?? null, error: answer.error ?? null });
  const sb = {
    from(table: string) {
      const call: (typeof calls)[number] = { table, eq: [], gt: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {
        select(cols: string) { call.select = cols; if (!call.op) call.op = "select"; return chain; },
        insert(row: unknown) { call.op = "insert"; call.payload = row; return chain; },
        delete() { call.op = "delete"; return chain; },
        eq(col: string, val: unknown) { call.eq.push([col, val]); return chain; },
        gt(col: string, val: unknown) { call.gt.push([col, val]); return chain; },
        order(col: string, o: unknown) { call.order = [col, o]; return chain; },
        single() { return Promise.resolve(result()); },
        then(res: (v: unknown) => unknown) { return Promise.resolve(result()).then(res); },
      };
      return chain;
    },
  };
  return { sb, calls };
}

const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.parse("2026-10-17T20:00:00Z");

describe("limits match the database", () => {
  it("280 characters, 5 live notes", () => {
    expect(M.MAX_CHARS).toBe(280);
    expect(M.MAX_LIVE).toBe(5);
  });
});

describe("clean, size and check", () => {
  it("keeps line breaks, turns other control characters into spaces and trims the ends", () => {
    expect(M.clean("  hello\r\nworld\u0007 x \u0000 ")).toBe("hello\nworld  x");
    expect(M.clean(null)).toBe("");
  });
  it("counts an emoji as ONE character, like the database", () => {
    expect(M.size("a🙏b")).toBe(3);
    expect(M.check("🙏".repeat(280))).toBe("ok");
    expect(M.check("🙏".repeat(281))).toBe("too_long");
  });
  it("empty and blank are refused, 280 is accepted, 281 is refused", () => {
    expect(M.check("")).toBe("empty");
    expect(M.check("   \n ")).toBe("empty");
    expect(M.check("x".repeat(280))).toBe("ok");
    expect(M.check("x".repeat(281))).toBe("too_long");
  });
  it("the limit counts the cleaned text, not the padding around it", () => {
    expect(M.check("  " + "x".repeat(280) + "  ")).toBe("ok");
  });
});

describe("live", () => {
  const row = (id: string, createdOffset: number, expiresOffset: number): Moment =>
    ({ id, body: "b" + id, image_url: null, created_at: iso(NOW + createdOffset), expires_at: iso(NOW + expiresOffset) });
  it("drops a note that has ended, even from a cached page, and sorts newest first", () => {
    const out = M.live([row("old", -3_600_000, 60_000), row("ended", -90_000_000, -1000), row("new", -60_000, 3_600_000)], NOW);
    expect(out.map((m) => m.id)).toEqual(["new", "old"]);
  });
  it("a note that ends exactly now is gone", () => {
    expect(M.live([row("edge", -1000, 0)], NOW)).toEqual([]);
  });
  it("caps at five and ignores rows that are not notes", () => {
    const many = Array.from({ length: 7 }, (_, i) => row("n" + i, -i * 1000, 3_600_000));
    expect(M.live(many, NOW)).toHaveLength(5);
    expect(M.live([null, {}, { id: "x" }, { id: "y", body: "", expires_at: iso(NOW + 5000) }, "str"], NOW)).toEqual([]);
    expect(M.live(undefined, NOW)).toEqual([]);
  });
});

describe("listMine", () => {
  it("reads only the author's own notes that have not ended, newest first", async () => {
    const { sb, calls } = fake({ data: [{ id: "m1" }] });
    expect(await M.listMine(sb, "me", "2026-10-17T20:00:00.000Z")).toEqual([{ id: "m1" }]);
    expect(calls[0].table).toBe("moments");
    expect(calls[0].eq).toEqual([["contributor_id", "me"]]);
    expect(calls[0].gt).toEqual([["expires_at", "2026-10-17T20:00:00.000Z"]]);
    expect(calls[0].order).toEqual(["created_at", { ascending: false }]);
  });
  it("throws when the read fails", async () => {
    await expect(M.listMine(fake({ error: { message: "x" } }).sb, "me")).rejects.toEqual({ message: "x" });
  });
});

describe("post", () => {
  it("sends the author's id, the cleaned text and no expiry, and returns the stored note", async () => {
    const stored = { id: "m1", body: "Hello", image_url: null, created_at: "c", expires_at: "e" };
    const { sb, calls } = fake({ data: stored });
    const out = await M.post(sb, "me", "  Hello  ");
    expect(out).toEqual({ status: "posted", moment: stored });
    expect(calls[0].op).toBe("insert");
    expect(calls[0].payload).toEqual({ contributor_id: "me", body: "Hello", image_url: null });   // no created_at / expires_at: the database sets the window
  });
  it("sends a picture link only when it fits the database's 500 characters", async () => {
    const a = fake({ data: {} });
    await M.post(a.sb, "me", "x", "https://example.test/a.jpg");
    expect((a.calls[0].payload as { image_url: string }).image_url).toBe("https://example.test/a.jpg");
    const b = fake({ data: {} });
    await M.post(b.sb, "me", "x", "https://example.test/" + "a".repeat(500));
    expect((b.calls[0].payload as { image_url: unknown }).image_url).toBeNull();
  });
  it("refuses an empty or too-long note BEFORE any request", async () => {
    const { sb, calls } = fake();
    expect(await M.post(sb, "me", "  ")).toEqual({ status: "empty" });
    expect(await M.post(sb, "me", "x".repeat(281))).toEqual({ status: "too_long" });
    expect(calls).toHaveLength(0);
  });
  it("the sixth live note is the 'limit' status, not a crash", async () => {
    const out = await M.post(fake({ error: { code: "P0001", message: "moments_limit" } }).sb, "me", "x");
    expect(out).toEqual({ status: "limit" });
  });
  it("someone who may not post is 'not_allowed'", async () => {
    const out = await M.post(fake({ error: { code: "42501", message: "new row violates row-level security policy" } }).sb, "me", "x");
    expect(out).toEqual({ status: "not_allowed" });
  });
  it("any other failure is thrown, and an unrelated P0001 is not mistaken for the limit", async () => {
    await expect(M.post(fake({ error: { code: "P0001", message: "something else" } }).sb, "me", "x")).rejects.toMatchObject({ code: "P0001" });
    await expect(M.post(fake({ error: { code: "500", message: "boom" } }).sb, "me", "x")).rejects.toMatchObject({ code: "500" });
  });
});

describe("takeDown", () => {
  it("deletes exactly that note by id", async () => {
    const { sb, calls } = fake();
    await M.takeDown(sb, "m9");
    expect(calls[0]).toMatchObject({ table: "moments", op: "delete", eq: [["id", "m9"]] });
  });
  it("throws when the call fails", async () => {
    await expect(M.takeDown(fake({ error: { message: "nope" } }).sb, "m9")).rejects.toEqual({ message: "nope" });
  });
});
