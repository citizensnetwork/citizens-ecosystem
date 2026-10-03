/**
 * C1 / C1b: one merged list per kind (the public feed plus the signed-in
 * owner's own rows of every status) that store.jsx splits back into two
 * audiences. These helpers (`data.jsx`) ARE that split, so they carry the
 * promise "a cancelled row never reaches the map, Kingdom Discovery or any
 * public list, and never vanishes from its owner's dashboard".
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Row = { id: string; organizerId?: string | null; status?: string; visibility?: string; [k: string]: unknown };
type Data = {
  isPubliclyListed: (r: Row | null | undefined) => boolean;
  publicRows: (rows: Row[] | null | undefined) => Row[];
  ownedRows: (rows: Row[] | null | undefined, ownerId: string | null | undefined) => Row[];
  mergeRowsById: (prev: Row[], incoming: Row[] | null | undefined) => Row[];
};

let DATA: Data;
beforeAll(() => {
  DATA = loadFrontend("data.jsx").DATA as Data;
});

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const live = { id: "e-live", organizerId: OWNER, status: "published" };
const cancelled = { id: "e-cancelled", organizerId: OWNER, status: "cancelled" };
const draft = { id: "e-draft", organizerId: OWNER, status: "draft" };
const privateOne = { id: "e-private", organizerId: OWNER, status: "published", visibility: "private" };
const others = { id: "e-other", organizerId: OTHER, status: "published" };
const noStatus = { id: "e-local", organizerId: OWNER };

describe("publicRows — what the map, Discovery and every public list may show", () => {
  it("keeps published public rows and drops cancelled, draft and private ones", () => {
    const rows = [live, cancelled, draft, privateOne, others];
    expect(DATA.publicRows(rows).map((r) => r.id)).toEqual(["e-live", "e-other"]);
  });

  it("treats a row with no status (an optimistic local draft, the demo seed) as live", () => {
    expect(DATA.publicRows([noStatus]).map((r) => r.id)).toEqual(["e-local"]);
  });

  it("survives a missing list and a null row", () => {
    expect(DATA.publicRows(null)).toEqual([]);
    expect(DATA.publicRows(undefined)).toEqual([]);
    expect(DATA.isPubliclyListed(null)).toBe(false);
  });
});

describe("ownedRows — the dashboard never loses a cancelled item", () => {
  it("returns the owner's rows of EVERY status, and nobody else's", () => {
    const rows = [live, cancelled, draft, privateOne, others, noStatus];
    expect(DATA.ownedRows(rows, OWNER).map((r) => r.id)).toEqual(["e-live", "e-cancelled", "e-draft", "e-private", "e-local"]);
  });

  it("returns nothing, never everything, without an owner id", () => {
    expect(DATA.ownedRows([live, others], null)).toEqual([]);
    expect(DATA.ownedRows([live, others], undefined)).toEqual([]);
    expect(DATA.ownedRows([live, others], "")).toEqual([]);
    expect(DATA.ownedRows(null, OWNER)).toEqual([]);
  });
});

describe("cancel and restore, seen through both audiences", () => {
  const flip = (rows: Row[], id: string, status: string) => rows.map((r) => (r.id === id ? { ...r, status } : r));

  it("cancel takes the pin off the public list at once but keeps the row for its owner", () => {
    const after = flip([live, others], "e-live", "cancelled");
    expect(DATA.publicRows(after).map((r) => r.id)).toEqual(["e-other"]);
    expect(DATA.ownedRows(after, OWNER).map((r) => r.id)).toEqual(["e-live"]);
    expect(DATA.ownedRows(after, OWNER)[0].status).toBe("cancelled");
  });

  it("restore puts it back on the public list", () => {
    const back = flip(flip([live], "e-live", "cancelled"), "e-live", "published");
    expect(DATA.publicRows(back).map((r) => r.id)).toEqual(["e-live"]);
  });
});

describe("mergeRowsById — an owner read lands beside the public feed without clobbering it", () => {
  it("adds the owner's cancelled row that the public feed never had, in front", () => {
    const merged = DATA.mergeRowsById([others], [cancelled]);
    expect(merged.map((r) => r.id)).toEqual(["e-cancelled", "e-other"]);
    expect(DATA.publicRows(merged).map((r) => r.id)).toEqual(["e-other"]);
  });

  it("lets the fresh row win for an id both lists have", () => {
    const merged = DATA.mergeRowsById([{ ...live, title: "old" }], [{ ...live, title: "new" }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("new");
  });

  it("keeps the map bubble and the per-event counts that arrived from other sources", () => {
    const prev = [{ ...live, broadcast: { message: "Doors open", minsAgo: 0 }, connectCount: 5, considerCount: 2, viewCount: 9 }];
    const fresh = [{ ...live, broadcast: null, connectCount: 0, considerCount: 0 }];
    const [row] = DATA.mergeRowsById(prev, fresh);
    expect(row.broadcast).toEqual({ message: "Doors open", minsAgo: 0 });
    expect(row.connectCount).toBe(5);
    expect(row.considerCount).toBe(2);
    expect(row.viewCount).toBe(9);
  });

  it("does not let a stale kept value beat a fresh non-empty one", () => {
    const [row] = DATA.mergeRowsById([{ ...live, connectCount: 5 }], [{ ...live, connectCount: 7 }]);
    expect(row.connectCount).toBe(7);
  });

  it("leaves rows the read did not mention alone", () => {
    const merged = DATA.mergeRowsById([live, others], [cancelled]);
    expect(merged.map((r) => r.id)).toEqual(["e-cancelled", "e-live", "e-other"]);
  });

  it("returns the very same list when there is nothing to merge", () => {
    const prev = [live];
    expect(DATA.mergeRowsById(prev, [])).toBe(prev);
    expect(DATA.mergeRowsById(prev, null)).toBe(prev);
  });

  it("does not mutate its inputs", () => {
    const prev = [Object.freeze({ ...live })] as Row[];
    const incoming = [Object.freeze({ ...cancelled })] as Row[];
    expect(() => DATA.mergeRowsById(prev, incoming)).not.toThrow();
  });
});
