import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

/**
 * A small query fake that models exactly the chain GET /api/automation/sources uses (eq, in, the
 * "is null or older than" or-filter, order, range, limit), so the paging and the database-side
 * narrowing are tested for real. Every call is recorded.
 */
const db: { profiles: Row[]; listing_sources: Row[]; fail: Set<string>; queries: { table: string; calls: unknown[][] }[] } = {
  profiles: [],
  listing_sources: [],
  fail: new Set(),
  queries: [],
};

function from(table: "profiles" | "listing_sources") {
  const calls: unknown[][] = [];
  db.queries.push({ table, calls });
  const filters: ((r: Row) => boolean)[] = [];
  const orders: { col: string; ascending: boolean; nullsFirst: boolean }[] = [];
  let window: [number, number] | null = null;
  let cap = Infinity;
  let columns: string[] = [];
  const run = () => {
    if (db.fail.has(table)) return { data: null, error: { message: "boom" } };
    let rows = db[table].filter((r) => filters.every((f) => f(r)));
    rows = [...rows].sort((a, b) => {
      for (const o of orders) {
        const x = a[o.col] as string | null;
        const y = b[o.col] as string | null;
        if (x === y) continue;
        if (x === null || x === undefined) return o.nullsFirst ? -1 : 1;
        if (y === null || y === undefined) return o.nullsFirst ? 1 : -1;
        return (x < y ? -1 : 1) * (o.ascending ? 1 : -1);
      }
      return 0;
    });
    if (window) rows = rows.slice(window[0], window[1] + 1);
    rows = rows.slice(0, cap);
    return { data: rows.map((r) => Object.fromEntries(columns.filter((c) => c in r).map((c) => [c, r[c]]))), error: null };
  };
  const b = {
    select(cols: string) {
      calls.push(["select", cols]);
      columns = cols.split(",").map((c) => c.trim());
      return b;
    },
    eq(c: string, v: unknown) {
      calls.push(["eq", c, v]);
      filters.push((r) => r[c] === v);
      return b;
    },
    in(c: string, vs: unknown[]) {
      calls.push(["in", c, vs]);
      filters.push((r) => vs.includes(r[c]));
      return b;
    },
    or(expr: string) {
      calls.push(["or", expr]);
      const m = /^([a-z_]+)\.is\.null,\1\.lt\.(.+)$/.exec(expr);
      if (!m) throw new Error(`unmodelled or(): ${expr}`);
      const [, col, cutoff] = m;
      filters.push((r) => r[col] === null || r[col] === undefined || String(r[col]) < cutoff);
      return b;
    },
    order(col: string, o: { ascending: boolean; nullsFirst?: boolean }) {
      calls.push(["order", col, o]);
      orders.push({ col, ascending: o.ascending, nullsFirst: !!o.nullsFirst });
      return b;
    },
    range(a: number, z: number) {
      calls.push(["range", a, z]);
      window = [a, z];
      return b;
    },
    limit(n: number) {
      calls.push(["limit", n]);
      cap = n;
      return b;
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(res, rej);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ from })) }));
const gate = vi.fn();
vi.mock("@/lib/v1Gate", () => ({ gateV1: (...a: unknown[]) => gate(...a) }));

const { GET } = await import("@/app/api/automation/sources/route");

const KEY = { id: "key-1", owner_id: "admin-1", scopes: ["automation:suggest"], rate_limit_per_minute: null, raw_prefix: "cck_live_abcd1234" };
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const profile = (id: string, over: Row = {}): Row => ({
  id,
  role: "contributor",
  contributor_status: "approved",
  contributor_hidden: false,
  deleted_at: null,
  auto_update_level: "suggest",
  full_name: "Grace Fellowship Example",
  email: "office@church.example",
  ...over,
});
let seq = 0;
const source = (contributor_id: string, over: Row = {}): Row => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  contributor_id,
  kind: "website",
  url: "https://www.church.example/",
  enabled: true,
  last_checked_at: null,
  last_status: null,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const req = () => new Request("http://localhost/api/automation/sources", { headers: { Authorization: "Bearer cck_live_x" } });

beforeEach(() => {
  vi.clearAllMocks();
  db.profiles = [profile(A)];
  db.listing_sources = [];
  db.fail.clear();
  db.queries = [];
  gate.mockResolvedValue({ key: KEY, identifier: "key:1" });
});

describe("GET /api/automation/sources: who may call it", () => {
  it("401 with no API key, and reads nothing", async () => {
    gate.mockResolvedValue({ key: null, identifier: "ip" });
    expect((await GET(req())).status).toBe(401);
    expect(db.queries).toHaveLength(0);
  });
  it("403 for a key without the automation:suggest scope (a digest key cannot list sources)", async () => {
    gate.mockResolvedValue({ key: { ...KEY, scopes: ["automation:digest"] }, identifier: "key:1" });
    expect((await GET(req())).status).toBe(403);
    expect(db.queries).toHaveLength(0);
  });
  it("passes a rate-limit refusal straight through", async () => {
    const { NextResponse } = await import("next/server");
    gate.mockResolvedValue({ key: KEY, deny: NextResponse.json({ error: "Too many requests" }, { status: 429 }), identifier: "key:1" });
    expect((await GET(req())).status).toBe(429);
    expect(db.queries).toHaveLength(0);
  });
  it("shares the suggestions route's limiter bucket (one key, one quota for the whole job)", async () => {
    await GET(req());
    expect(gate).toHaveBeenCalledWith(expect.any(Request), { bucket: "automation-suggestions" });
  });
});

describe("GET /api/automation/sources: what it returns", () => {
  it("returns due sources with exactly the documented fields, no-store, and nothing private", async () => {
    const s = source(A, { last_status: "2 events found" });
    db.listing_sources = [s];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ sources: [{ source_id: s.id, contributor_id: A, kind: "website", url: "https://www.church.example/", last_status: "2 events found" }], count: 1 });
    const text = JSON.stringify(body);
    for (const secret of ["office@church.example", "Grace Fellowship", "suggest", "created_at"]) expect(text).not.toContain(secret);
  });

  it("only eligible Contributors' sources: not approved, hidden, deleted, a Citizen, or automation off are all left out", async () => {
    const owners = [
      profile(B, { contributor_status: "pending" }),
      profile(C, { contributor_hidden: true }),
      profile("dddddddd-dddd-4ddd-8ddd-dddddddddddd", { deleted_at: "2026-01-01T00:00:00Z" }),
      profile("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", { role: "citizen" }),
      profile("ffffffff-ffff-4fff-8fff-ffffffffffff", { auto_update_level: "off" }),
    ];
    db.profiles = [profile(A), ...owners];
    db.listing_sources = [source(A), ...owners.map((p) => source(p.id as string))];
    const { sources } = await (await GET(req())).json();
    expect(sources.map((s: Row) => s.contributor_id)).toEqual([A]);
  });

  it("narrows in the database: approved Contributors at an opted-in level; enabled, readable, due sources, oldest first", async () => {
    db.listing_sources = [source(A)];
    await GET(req());
    const [p, s] = db.queries;
    expect(p.table).toBe("profiles");
    expect(p.calls).toEqual(
      expect.arrayContaining([
        ["eq", "role", "contributor"],
        ["eq", "contributor_status", "approved"],
        ["in", "auto_update_level", ["suggest", "events_auto"]],
      ]),
    );
    expect(s.table).toBe("listing_sources");
    expect(s.calls).toEqual(
      expect.arrayContaining([
        ["eq", "enabled", true],
        ["in", "kind", ["website", "youtube", "calendar"]],
        ["order", "last_checked_at", { ascending: true, nullsFirst: true }],
      ]),
    );
    const or = s.calls.find((c) => c[0] === "or")?.[1] as string;
    const cutoff = Date.parse(or.split(".lt.")[1]);
    expect(Math.abs(Date.now() - 20 * 3_600_000 - cutoff)).toBeLessThan(60_000);
  });

  it("leaves out switched-off sources, unreadable kinds and recent checks; never-checked come first", async () => {
    const never = source(A);
    const old = source(A, { last_checked_at: hoursAgo(48) });
    db.listing_sources = [
      old,
      source(A, { enabled: false }),
      source(A, { kind: "facebook", url: "https://www.facebook.com/x", enabled: false }),
      source(A, { last_checked_at: hoursAgo(3) }),
      never,
    ];
    const { sources } = await (await GET(req())).json();
    expect(sources.map((s: Row) => s.source_id)).toEqual([never.id, old.id]);
  });

  it("with nobody opted in, answers an empty list without reading the sources table", async () => {
    db.profiles = [profile(A, { auto_update_level: "off" })];
    db.listing_sources = [source(A)];
    expect(await (await GET(req())).json()).toEqual({ sources: [], count: 0 });
    expect(db.queries.map((q) => q.table)).toEqual(["profiles"]);
  });

  it("caps at 200, and pages past rows of ineligible owners to find them", async () => {
    db.profiles = [profile(A), profile(B, { contributor_hidden: true, auto_update_level: "suggest" })];
    // 600 never-checked rows of a hidden listing sort first (lower ids), then 250 of an eligible one.
    db.listing_sources = [
      ...Array.from({ length: 600 }, () => source(B)),
      ...Array.from({ length: 250 }, () => source(A, { last_checked_at: hoursAgo(30) })),
    ];
    const { sources, count } = await (await GET(req())).json();
    expect(count).toBe(200);
    expect(sources.every((s: Row) => s.contributor_id === A)).toBe(true);
    expect(db.queries.filter((q) => q.table === "listing_sources")).toHaveLength(2);
  });

  it("500 with a fixed message if either read fails", async () => {
    db.fail.add("profiles");
    let res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "read_failed" });
    db.fail.clear();
    db.listing_sources = [source(A)];
    db.fail.add("listing_sources");
    res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "read_failed" });
  });
});
