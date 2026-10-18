import { describe, it, expect } from "vitest";
import { acceptedCohostEventIds, attachCoHostIds, createdByOrIn, COHOST_EVENTS_CAP } from "@/lib/events/cohosts";

/**
 * The helpers behind the public co-host read surface (tracker P2-09, migration 184). The route tests
 * (__tests__/api/v1/events-cohosts.test.ts) cover the wiring; this file pins the pure parts on their own, including the
 * second line of defence: createdByOrIn re-checks every id as a UUID even when its caller already did, because what it
 * builds is text that PostgREST parses (a comma or a bracket in an id would change the filter).
 */

const A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const E1 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21";
const E2 = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

type Call = { ops: [string, unknown[]][] };
function client(answer: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  return {
    calls,
    from(table: string) {
      expect(table).toBe("event_cohosts");
      const call: Call = { ops: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "limit"]) chain[op] = (...a: unknown[]) => { call.ops.push([op, a]); return chain; };
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(answer).then(res, rej);
      return chain;
    },
  };
}

describe("createdByOrIn", () => {
  it("no co-hosted events is just created-by", () => expect(createdByOrIn(A, [])).toBe(`created_by.eq.${A}`));
  it("one or more is created-by OR id in (...)", () => {
    expect(createdByOrIn(A, [E1])).toBe(`created_by.eq.${A},id.in.(${E1})`);
    expect(createdByOrIn(A, [E1, E2])).toBe(`created_by.eq.${A},id.in.(${E1},${E2})`);
  });
  it("drops anything that is not a UUID (a comma or a bracket would rewrite the filter)", () => {
    expect(createdByOrIn(A, ["x),created_by.neq.(", E1, "", "1", " " + E2])).toBe(`created_by.eq.${A},id.in.(${E1})`);
    expect(createdByOrIn(A, ["not-a-uuid"])).toBe(`created_by.eq.${A}`);
  });
  it("refuses a contributor id that is not a UUID instead of putting it in the filter", () => {
    for (const bad of ["", "x", `${A},created_by.neq.${A}`, "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a1"]) expect(() => createdByOrIn(bad, [E1])).toThrow();
  });
});

describe("acceptedCohostEventIds", () => {
  it("asks for this Contributor's ACCEPTED invitations only, with a ceiling", async () => {
    const c = client({ data: [{ event_id: E1 }, { event_id: E2 }], error: null });
    expect(await acceptedCohostEventIds(c, A)).toEqual([E1, E2]);
    expect(c.calls[0].ops).toEqual([["select", ["event_id"]], ["eq", ["contributor_id", A]], ["eq", ["status", "accepted"]], ["limit", [COHOST_EVENTS_CAP]]]);
  });
  it("a contributor id that is not a UUID asks nothing", async () => {
    const c = client({ data: [{ event_id: E1 }], error: null });
    expect(await acceptedCohostEventIds(c, "nope")).toEqual([]);
    expect(c.calls).toHaveLength(0);
  });
  it("drops junk ids, and a failed or odd answer is an empty list", async () => {
    expect(await acceptedCohostEventIds(client({ data: [{ event_id: "x" }, { event_id: E1 }, {}, { event_id: 5 }], error: null }), A)).toEqual([E1]);
    expect(await acceptedCohostEventIds(client({ data: null, error: { message: "boom" } }), A)).toEqual([]);
    expect(await acceptedCohostEventIds(client({ data: "nope", error: null }), A)).toEqual([]);
  });
});

describe("attachCoHostIds", () => {
  it("groups accepted co-hosts by event, sorted, [] for events with none; the rows keep their other fields", async () => {
    const H1 = "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a31";
    const H2 = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a32";
    const c = client({ data: [{ event_id: E1, contributor_id: H2 }, { event_id: E1, contributor_id: H1 }], error: null });
    const out = await attachCoHostIds(c, [{ id: E1, title: "One" }, { id: E2, title: "Two" }]);
    expect(out).toEqual([{ id: E1, title: "One", co_host_ids: [H1, H2] }, { id: E2, title: "Two", co_host_ids: [] }]);
    expect(c.calls[0].ops).toEqual([["select", ["event_id,contributor_id"]], ["eq", ["status", "accepted"]], ["in", ["event_id", [E1, E2]]]]);
  });
  it("no events asks nothing; a failed read gives empty lists", async () => {
    const c = client({ data: [], error: null });
    expect(await attachCoHostIds(c, [])).toEqual([]);
    expect(c.calls).toHaveLength(0);
    expect(await attachCoHostIds(client({ data: null, error: { message: "x" } }), [{ id: E1 }])).toEqual([{ id: E1, co_host_ids: [] }]);
  });
});
