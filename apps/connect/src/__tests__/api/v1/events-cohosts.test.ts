import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Co-hosted events on the public read surface (tracker P2-09, migration 184).
 *   GET /api/v1/events                 each row gets `co_host_ids`; `?created_by=` also lists the events they co-host
 *   GET /api/v1/contributors/<slug>    upcoming and past include the events they co-host
 * The database is a recording stand-in: one answer per table, every call kept, so a test can check WHAT WAS ASKED (only
 * ACCEPTED invitations, only UUIDs in the filter text) as well as what comes back.
 */

const A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // the Contributor
const E1 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21";
const E2 = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const E3 = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a23";
const H1 = "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a31";
const H2 = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a32";

type Call = { table: string; ops: [string, unknown[]][] };
let calls: Call[] = [];
let answers: Record<string, { data: unknown; error: unknown }> = {};

function from(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { call.ops.push([op, args]); return chain; };
  for (const op of ["select", "eq", "gte", "lt", "lte", "in", "or", "not", "order", "range", "limit"]) chain[op] = record(op);
  chain.maybeSingle = () => Promise.resolve(answers[`${table}:single`] ?? { data: null, error: null });
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(answers[table] ?? { data: [], error: null, count: 0 }).then(res, rej);
  return chain;
}
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({ from }) }));
vi.mock("@/lib/v1Gate", () => ({ gateV1: vi.fn().mockResolvedValue({ key: null, identifier: "test" }) }));

const eventsMod = await import("@/app/api/v1/events/route");
const contributorMod = await import("@/app/api/v1/contributors/[slug]/route");
const eventDetailMod = await import("@/app/api/v1/events/[id]/route");

const cohostCalls = () => calls.filter((c) => c.table === "event_cohosts");
const op = (c: Call, name: string) => c.ops.filter(([n]) => n === name).map(([, a]) => a);

beforeEach(() => {
  calls = [];
  answers = {};
});

describe("GET /api/v1/events: co_host_ids", () => {
  it("adds the accepted co-hosts to each event, asks only for ACCEPTED ones, and only for the events on this page", async () => {
    answers.events = { data: [{ id: E1, created_by: A }, { id: E2, created_by: A }], error: null };
    answers.event_cohosts = { data: [{ event_id: E1, contributor_id: H2 }, { event_id: E1, contributor_id: H1 }], error: null };
    const res = await eventsMod.GET(new Request("http://localhost/api/v1/events"));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.data.map((r: { id: string; co_host_ids: string[] }) => [r.id, r.co_host_ids])).toEqual([[E1, [H1, H2]], [E2, []]]); // sorted, [] for none
    expect(j.data[0].created_by).toBe(A); // the organiser is untouched
    const c = cohostCalls();
    expect(c).toHaveLength(1);
    expect(op(c[0], "eq")).toEqual([["status", "accepted"]]);
    expect(op(c[0], "in")).toEqual([["event_id", [E1, E2]]]);
  });

  it("an empty page makes no co-host request at all", async () => {
    answers.events = { data: [], error: null };
    await eventsMod.GET(new Request("http://localhost/api/v1/events"));
    expect(cohostCalls()).toHaveLength(0);
  });

  it("a failed co-host read does not fail the feed: events still come back, with no co-hosts", async () => {
    answers.events = { data: [{ id: E1, created_by: A }], error: null };
    answers.event_cohosts = { data: null, error: { message: "boom" } };
    const res = await eventsMod.GET(new Request("http://localhost/api/v1/events"));
    expect(res.status).toBe(200);
    expect((await res.json()).data[0].co_host_ids).toEqual([]);
  });

  it("rows that are not UUIDs or co-host rows with a bad id are ignored", async () => {
    answers.events = { data: [{ id: E1 }, { id: "not-a-uuid" }], error: null };
    answers.event_cohosts = { data: [{ event_id: E1, contributor_id: "nope" }, { event_id: "x", contributor_id: H1 }], error: null };
    const j = await (await eventsMod.GET(new Request("http://localhost/api/v1/events"))).json();
    expect(j.data.map((r: { co_host_ids: string[] }) => r.co_host_ids)).toEqual([[], []]);
    expect(op(cohostCalls()[0], "in")).toEqual([["event_id", [E1]]]);
  });
});

describe("GET /api/v1/events?created_by=: the events they co-host come too", () => {
  it("filters by created-by OR one of the accepted co-host event ids", async () => {
    answers.event_cohosts = { data: [{ event_id: E3 }], error: null };
    answers.events = { data: [{ id: E3, created_by: H1 }], error: null };
    await eventsMod.GET(new Request(`http://localhost/api/v1/events?created_by=${A}`));
    const lookup = cohostCalls()[0];
    expect(op(lookup, "eq")).toEqual([["contributor_id", A], ["status", "accepted"]]);
    const events = calls.find((c) => c.table === "events")!;
    expect(op(events, "or")).toEqual([[`created_by.eq.${A},id.in.(${E3})`]]);
    expect(op(events, "eq").some(([col]) => (col as string) === "created_by")).toBe(false); // no longer a plain created_by filter
  });

  it("with no co-hosted events it is just created-by", async () => {
    answers.event_cohosts = { data: [], error: null };
    await eventsMod.GET(new Request(`http://localhost/api/v1/events?created_by=${A}`));
    expect(op(calls.find((c) => c.table === "events")!, "or")).toEqual([[`created_by.eq.${A}`]]);
  });

  it("a failed lookup falls back to just created-by", async () => {
    answers.event_cohosts = { data: null, error: { message: "boom" } };
    await eventsMod.GET(new Request(`http://localhost/api/v1/events?created_by=${A}`));
    expect(op(calls.find((c) => c.table === "events")!, "or")).toEqual([[`created_by.eq.${A}`]]);
  });

  it("nothing but a UUID reaches the filter text, even if the lookup returns junk", async () => {
    answers.event_cohosts = { data: [{ event_id: "x),created_by.neq.(" }, { event_id: E1 }], error: null };
    await eventsMod.GET(new Request(`http://localhost/api/v1/events?created_by=${A}`));
    expect(op(calls.find((c) => c.table === "events")!, "or")).toEqual([[`created_by.eq.${A},id.in.(${E1})`]]);
  });

  it("an invalid created_by is ignored (no lookup, no filter)", async () => {
    await eventsMod.GET(new Request("http://localhost/api/v1/events?created_by=a%29%2Cb"));
    expect(cohostCalls().filter((c) => op(c, "eq").some(([col]) => col === "contributor_id"))).toHaveLength(0);
    expect(op(calls.find((c) => c.table === "events")!, "or")).toEqual([]);
  });
});

describe("GET /api/v1/contributors/<slug>: upcoming and past include co-hosted events", () => {
  it("both lists filter by created-by OR the accepted co-host event ids", async () => {
    answers["profiles:single"] = { data: { id: A, full_name: "Fixture Fellowship 1" }, error: null };
    answers.event_cohosts = { data: [{ event_id: E3 }, { event_id: E2 }], error: null };
    answers.events = { data: [], error: null };
    const res = await contributorMod.GET(new Request("http://localhost/api/v1/contributors/fixture"), { params: Promise.resolve({ slug: "fixture" }) });
    expect(res.status).toBe(200);
    expect(op(cohostCalls()[0], "eq")).toEqual([["contributor_id", A], ["status", "accepted"]]);
    const eventCalls = calls.filter((c) => c.table === "events");
    expect(eventCalls).toHaveLength(2);
    for (const c of eventCalls) {
      expect(op(c, "or")).toEqual([[`created_by.eq.${A},id.in.(${E3},${E2})`]]);
      expect(op(c, "eq")).toEqual([["status", "published"], ["visibility", "public"]]);
    }
  });

  it("a Contributor who co-hosts nothing is filtered by created-by only", async () => {
    answers["profiles:single"] = { data: { id: A }, error: null };
    answers.event_cohosts = { data: [], error: null };
    await contributorMod.GET(new Request("http://localhost/api/v1/contributors/fixture"), { params: Promise.resolve({ slug: "fixture" }) });
    for (const c of calls.filter((x) => x.table === "events")) expect(op(c, "or")).toEqual([[`created_by.eq.${A}`]]);
  });

  it("an unknown slug is still a 404 and asks for no co-hosts", async () => {
    answers["profiles:single"] = { data: null, error: null };
    const res = await contributorMod.GET(new Request("http://localhost/api/v1/contributors/none"), { params: Promise.resolve({ slug: "none" }) });
    expect(res.status).toBe(404);
    expect(cohostCalls()).toHaveLength(0);
  });
});

describe("GET /api/v1/events/<id>: co_host_ids", () => {
  it("the single-event view lists its accepted co-hosts too, and asks only for ACCEPTED ones", async () => {
    answers["events:single"] = { data: { id: E1, title: "One", created_by: A }, error: null };
    answers.event_cohosts = { data: [{ event_id: E1, contributor_id: H1 }], error: null };
    const res = await eventDetailMod.GET(new Request(`http://localhost/api/v1/events/${E1}`), { params: Promise.resolve({ id: E1 }) });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.data).toMatchObject({ id: E1, created_by: A, co_host_ids: [H1] });
    expect(j.data.stats).toBeDefined(); // the rest of the payload is untouched
    expect(op(cohostCalls()[0], "eq")).toEqual([["status", "accepted"]]);
  });

  it("an unknown event is still a 404 and asks for no co-hosts", async () => {
    answers["events:single"] = { data: null, error: null };
    const res = await eventDetailMod.GET(new Request(`http://localhost/api/v1/events/${E1}`), { params: Promise.resolve({ id: E1 }) });
    expect(res.status).toBe(404);
    expect(cohostCalls()).toHaveLength(0);
  });
});
