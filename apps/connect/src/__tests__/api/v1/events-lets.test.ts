/**
 * GET /api/v1/events?lets=1 and the public event payload include lets_starter
 * (issue #313). If migration 202 is not applied yet, a Let's-only request is
 * empty and the ordinary feed retries without the column.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const E1 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21";

type Call = { table: string; ops: [string, unknown[]][] };
let calls: Call[] = [];
let eventResults: { data: unknown; error: unknown }[] = [];

function from(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => {
    call.ops.push([op, args]);
    return chain;
  };
  for (const op of ["select", "eq", "gte", "lte", "not", "order", "range", "is", "or"]) chain[op] = record(op);
  chain.in = record("in");
  chain.limit = record("limit");
  chain.maybeSingle = () => Promise.resolve(eventResults.shift() ?? { data: null, error: null });
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(
      table === "events" ? (eventResults.shift() ?? { data: [], error: null }) : { data: [], error: null, count: 0 },
    ).then(res, rej);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({ from }),
}));
vi.mock("@/lib/v1Gate", () => ({
  gateV1: vi.fn().mockResolvedValue({ key: null, identifier: "test" }),
}));

const listMod = await import("@/app/api/v1/events/route");
const detailMod = await import("@/app/api/v1/events/[id]/route");

const eventsCalls = () => calls.filter((c) => c.table === "events");
const op = (c: Call, name: string) => c.ops.filter(([n]) => n === name).map(([, a]) => a);

beforeEach(() => {
  calls = [];
  eventResults = [];
});

describe("GET /api/v1/events lets_starter", () => {
  it("selects the marker and, with lets=1, only rows that have one", async () => {
    eventResults = [{ data: [{ id: E1, lets_starter: "pray", latitude: null, longitude: null }], error: null }];
    const res = await listMod.GET(new Request("http://localhost/api/v1/events?lets=1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].lets_starter).toBe("pray");
    const listed = eventsCalls();
    expect(listed).toHaveLength(1);
    expect(String(op(listed[0], "select")[0][0])).toContain("lets_starter");
    expect(op(listed[0], "not")).toEqual([["lets_starter", "is", null]]);
  });

  it("does not filter the ordinary feed", async () => {
    eventResults = [{ data: [], error: null }];
    await listMod.GET(new Request("http://localhost/api/v1/events"));
    expect(op(eventsCalls()[0], "not")).toEqual([]);
  });

  it("returns an empty Let's feed when the column is not applied yet, and retries the ordinary feed without it", async () => {
    const missing = { code: "PGRST204", message: "Could not find the 'lets_starter' column of 'events' in the schema cache" };
    eventResults = [{ data: null, error: missing }];
    const lets = await listMod.GET(new Request("http://localhost/api/v1/events?lets=1"));
    expect(lets.status).toBe(200);
    expect((await lets.json()).data).toEqual([]);
    expect(eventsCalls()).toHaveLength(1);

    calls = [];
    eventResults = [
      { data: null, error: missing },
      { data: [{ id: E1, latitude: null, longitude: null }], error: null },
    ];
    const all = await listMod.GET(new Request("http://localhost/api/v1/events"));
    expect(all.status).toBe(200);
    expect((await all.json()).data[0].id).toBe(E1);
    expect(eventsCalls()).toHaveLength(2);
    expect(String(op(eventsCalls()[1], "select")[0][0])).not.toContain("lets_starter");
  });
});

describe("GET /api/v1/events/[id] lets_starter", () => {
  it("includes the marker, and retries without it when the column is missing", async () => {
    eventResults = [{ data: { id: E1, lets_starter: "run" }, error: null }];
    const res = await detailMod.GET(new Request(`http://localhost/api/v1/events/${E1}`), {
      params: Promise.resolve({ id: E1 }),
    });
    expect((await res.json()).data.lets_starter).toBe("run");

    eventResults = [
      { data: null, error: { code: "42703", message: "column events.lets_starter does not exist" } },
      { data: { id: E1, title: "Run" }, error: null },
    ];
    const again = await detailMod.GET(new Request(`http://localhost/api/v1/events/${E1}`), {
      params: Promise.resolve({ id: E1 }),
    });
    expect(again.status).toBe(200);
    expect((await again.json()).data.title).toBe("Run");
  });
});
