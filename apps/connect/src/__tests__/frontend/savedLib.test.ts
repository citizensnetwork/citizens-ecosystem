/**
 * Save (`src/frontend/app/saved-lib.jsx`, tracker P2-04, migration 183): the data side of a PRIVATE bookmark.
 *
 * The browser calls these with the SIGNED-IN Supabase client, so row-level security is the wall (proved against the live
 * database by docs/audit/probes/183_saved_items.probe.sql). What this file pins down is what the app SENDS and how it reads
 * an answer: the owner's id on every call, exactly one target column, a repeat save is success, the 500 ceiling is a message
 * and not a crash, and any other failure is thrown so the heart can be rolled back.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Err = { code?: string; message?: string } | null;
type Api = {
  MAX: number;
  column: (kind: string) => string;
  load: (sb: unknown, uid: string) => Promise<{ contributors: Set<string>; places: Set<string> }>;
  add: (sb: unknown, uid: string, kind: string, id: string) => Promise<string>;
  remove: (sb: unknown, uid: string, kind: string, id: string) => Promise<void>;
};
let S: Api;
beforeAll(() => {
  S = loadFrontend("saved-lib.jsx").CCSaved as Api;
});

/** A stand-in for the supabase-js query builder that records every call and answers with what the test says. */
function fake(answer: { data?: unknown; error?: Err } = {}) {
  const calls: { table?: string; op?: string; payload?: unknown; select?: string; eq: [string, unknown][] }[] = [];
  const sb = {
    from(table: string) {
      const call: (typeof calls)[number] = { table, eq: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {
        select(cols: string) { call.op = "select"; call.select = cols; return chain; },
        insert(row: unknown) { call.op = "insert"; call.payload = row; return Promise.resolve({ error: answer.error ?? null }); },
        delete() { call.op = "delete"; return chain; },
        eq(col: string, val: unknown) {
          call.eq.push([col, val]);
          // select and delete both end in an awaited .eq(): make the chain thenable
          return Object.assign(chain, { then: (res: (v: unknown) => unknown) => res({ data: answer.data ?? null, error: answer.error ?? null }) });
        },
      };
      return chain;
    },
  };
  return { sb, calls };
}

describe("column", () => {
  it("a place saves into place_id, anything else into contributor_id", () => {
    expect(S.column("place")).toBe("place_id");
    expect(S.column("contributor")).toBe("contributor_id");
    expect(S.column("anything-else")).toBe("contributor_id");
  });
  it("the ceiling matches the database trigger (500)", () => expect(S.MAX).toBe(500));
});

describe("load", () => {
  it("reads only the owner's rows and splits them into contributors and places", async () => {
    const { sb, calls } = fake({ data: [{ contributor_id: "c1", place_id: null }, { contributor_id: null, place_id: "p1" }, { contributor_id: "c2", place_id: null }] });
    const out = await S.load(sb, "me");
    expect([...out.contributors].sort()).toEqual(["c1", "c2"]);
    expect([...out.places]).toEqual(["p1"]);
    expect(calls[0]).toMatchObject({ table: "saved_items", op: "select", select: "contributor_id,place_id", eq: [["user_id", "me"]] });
  });
  it("no rows is two empty sets, and a null answer is too", async () => {
    for (const data of [[], null]) {
      const out = await S.load(fake({ data }).sb, "me");
      expect(out.contributors.size + out.places.size).toBe(0);
    }
  });
  it("throws when the read fails, so the app keeps what it had instead of blanking the hearts", async () => {
    await expect(S.load(fake({ error: { code: "500", message: "boom" } }).sb, "me")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("add", () => {
  it("inserts the owner's id and exactly ONE target column", async () => {
    const a = fake(); expect(await S.add(a.sb, "me", "contributor", "c1")).toBe("saved");
    expect(a.calls[0]).toMatchObject({ table: "saved_items", op: "insert", payload: { user_id: "me", contributor_id: "c1" } });
    expect(Object.keys(a.calls[0].payload as object).sort()).toEqual(["contributor_id", "user_id"]);
    const b = fake(); expect(await S.add(b.sb, "me", "place", "p1")).toBe("saved");
    expect(Object.keys(b.calls[0].payload as object).sort()).toEqual(["place_id", "user_id"]);
  });
  it("saving the same thing twice (unique violation 23505) is success, not an error", async () => {
    expect(await S.add(fake({ error: { code: "23505", message: "duplicate key" } }).sb, "me", "place", "p1")).toBe("already");
  });
  it("the 500 ceiling comes back as 'limit', and ONLY for the trigger's own message", async () => {
    expect(await S.add(fake({ error: { code: "P0001", message: "saved_items_limit" } }).sb, "me", "place", "p1")).toBe("limit");
    await expect(S.add(fake({ error: { code: "P0001", message: "some other rule" } }).sb, "me", "place", "p1")).rejects.toMatchObject({ code: "P0001" });
  });
  it("any other failure is thrown (permission, network, foreign key)", async () => {
    for (const code of ["42501", "23503", "PGRST301"]) {
      await expect(S.add(fake({ error: { code, message: "x" } }).sb, "me", "contributor", "c1")).rejects.toMatchObject({ code });
    }
  });
});

describe("remove", () => {
  it("deletes by the owner's id AND the one target, never by the target alone", async () => {
    const a = fake();
    await S.remove(a.sb, "me", "contributor", "c1");
    expect(a.calls[0]).toMatchObject({ table: "saved_items", op: "delete", eq: [["user_id", "me"], ["contributor_id", "c1"]] });
    const b = fake();
    await S.remove(b.sb, "me", "place", "p1");
    expect(b.calls[0].eq).toEqual([["user_id", "me"], ["place_id", "p1"]]);
  });
  it("throws when the call fails", async () => {
    await expect(S.remove(fake({ error: { code: "42501", message: "denied" } }).sb, "me", "place", "p1")).rejects.toMatchObject({ code: "42501" });
  });
});
