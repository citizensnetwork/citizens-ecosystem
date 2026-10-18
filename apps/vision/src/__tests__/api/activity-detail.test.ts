import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET, PATCH, DELETE } = await import(
  "@/app/api/activities/[id]/route"
);

const ACT_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/activities/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`)
    );
    const res = await GET(req, makeParams(ACT_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL("http://localhost/api/activities/bad-id")
    );
    const res = await GET(req, makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when activity not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "not found" },
      }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`)
    );
    const res = await GET(req, makeParams(ACT_ID));
    expect(res.status).toBe(404);
  });

  it("returns activity with tags and department", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const actData = {
      id: ACT_ID,
      title: "Workshop",
      type: "workshop",
      activity_tags: [{ tag: "education" }],
      departments: { name: "Education" },
    };

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: actData, error: null }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`)
    );
    const res = await GET(req, makeParams(ACT_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.title).toBe("Workshop");
    expect(body.data.activity_tags).toHaveLength(1);
  });
});

// A recording stand-in for the two tables PATCH touches. `updated` is what the
// UPDATE ... RETURNING id gives back: an empty list is what Postgres returns when
// row-level security hides the row from the UPDATE (no error, nothing changed).
function patchWorld(opts: { updated?: { id: string }[]; updateError?: { message: string } | null } = {}) {
  const calls = {
    update: [] as unknown[],
    tagsDeleted: 0,
    tagsInserted: [] as unknown[],
    tables: [] as string[],
  };
  const refetched = { id: ACT_ID, org_id: "org-1", title: "Workshop", participant_count: 40, activity_tags: [{ tag: "food" }] };
  mockSupabase.from.mockImplementation((table: string) => {
    calls.tables.push(table);
    if (table === "activity_tags") {
      return {
        delete: () => {
          calls.tagsDeleted += 1;
          return { eq: () => Promise.resolve({ error: null }) };
        },
        insert: (rows: unknown) => {
          calls.tagsInserted.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    }
    return {
      update: (patch: unknown) => {
        calls.update.push(patch);
        return {
          eq: () => ({
            select: () =>
              Promise.resolve({
                data: opts.updated ?? [{ id: ACT_ID }],
                error: opts.updateError ?? null,
              }),
          }),
        };
      },
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: refetched, error: null }) }) }),
    };
  });
  return calls;
}

function patchRequest(body: unknown) {
  return new NextRequest(new URL(`http://localhost/api/activities/${ACT_ID}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/activities/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns 401 when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const res = await PATCH(patchRequest({ title: "Updated" }), makeParams(ACT_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid id", async () => {
    const res = await PATCH(patchRequest({ title: "Updated" }), makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for validation failure", async () => {
    const calls = patchWorld();
    const res = await PATCH(patchRequest({ type: "invalid_type" }), makeParams(ACT_ID));
    expect(res.status).toBe(400);
    expect(calls.update).toEqual([]);
  });

  it("updates activity fields", async () => {
    const calls = patchWorld();
    const res = await PATCH(patchRequest({ title: "Updated" }), makeParams(ACT_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(calls.update).toEqual([{ title: "Updated" }]);
    expect(body.data.id).toBe(ACT_ID);
  });

  describe("the place (V7: add, change or clear it on a logged activity)", () => {
    it("a place-only PATCH writes the place and nothing else: no participant count reset, no tag wipe", async () => {
      const calls = patchWorld();
      const place = { latitude: -25.7508, longitude: 28.2431, location_name: "Hatfield" };
      const res = await PATCH(patchRequest(place), makeParams(ACT_ID));

      expect(res.status).toBe(200);
      // Zod 4 used to add participant_count: 0 and tags: [] here, which zeroed the
      // Timeline Map's ring size and deleted every tag of the activity.
      expect(calls.update).toEqual([place]);
      expect(calls.tagsDeleted).toBe(0);
      expect(calls.tagsInserted).toEqual([]);
      expect(calls.tables).not.toContain("activity_tags");
    });

    it("clearing the place sends nulls for all three columns", async () => {
      const calls = patchWorld();
      const cleared = { latitude: null, longitude: null, location_name: null };
      const res = await PATCH(patchRequest(cleared), makeParams(ACT_ID));

      expect(res.status).toBe(200);
      expect(calls.update).toEqual([cleared]);
    });

    it("removing only the pin keeps the name (the activity leaves the map but keeps its text)", async () => {
      const calls = patchWorld();
      const noPin = { latitude: null, longitude: null, location_name: "Hatfield Baptist hall" };
      const res = await PATCH(patchRequest(noPin), makeParams(ACT_ID));

      expect(res.status).toBe(200);
      expect(calls.update).toEqual([noPin]);
    });

    it("a name-only change leaves the position as it was", async () => {
      const calls = patchWorld();
      const res = await PATCH(patchRequest({ location_name: "Renamed hall" }), makeParams(ACT_ID));

      expect(res.status).toBe(200);
      expect(calls.update).toEqual([{ location_name: "Renamed hall" }]);
    });

    it.each([
      ["a lone latitude", { latitude: -25.7 }],
      ["a lone longitude", { longitude: 28.2 }],
      ["a lone null latitude", { latitude: null }],
      ["a number and a null", { latitude: -25.7, longitude: null }],
      ["a null and a number", { latitude: null, longitude: 28.2 }],
    ])("refuses half a position (%s), so a new latitude can never pair with an old longitude", async (_n, body) => {
      const calls = patchWorld();
      const res = await PATCH(patchRequest(body), makeParams(ACT_ID));

      expect(res.status).toBe(400);
      expect(calls.update).toEqual([]);
    });

    it("refuses a position outside the globe", async () => {
      const calls = patchWorld();
      expect((await PATCH(patchRequest({ latitude: 91, longitude: 28 }), makeParams(ACT_ID))).status).toBe(400);
      expect((await PATCH(patchRequest({ latitude: -25, longitude: 181 }), makeParams(ACT_ID))).status).toBe(400);
      expect(calls.update).toEqual([]);
    });

    it("answers 404, not a quiet 200, when row-level security hides the activity from the update", async () => {
      const calls = patchWorld({ updated: [] });
      const res = await PATCH(
        patchRequest({ latitude: -25.7, longitude: 28.2, location_name: "Hatfield" }),
        makeParams(ACT_ID),
      );
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toMatch(/cannot change it/);
      expect(calls.update).toHaveLength(1);
    });

    it("answers 500 with the database's message when the update itself fails", async () => {
      patchWorld({ updated: [], updateError: { message: "boom" } });
      const res = await PATCH(patchRequest({ location_name: "x" }), makeParams(ACT_ID));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("boom");
    });
  });

  describe("fields it must not touch unless asked", () => {
    it("an empty body changes nothing and still answers with the activity", async () => {
      const calls = patchWorld();
      const res = await PATCH(patchRequest({}), makeParams(ACT_ID));

      expect(res.status).toBe(200);
      expect(calls.update).toEqual([]);
      expect(calls.tagsDeleted).toBe(0);
    });

    it("sending tags replaces them and does not touch the activity row", async () => {
      const calls = patchWorld();
      const res = await PATCH(patchRequest({ tags: ["food", "youth"] }), makeParams(ACT_ID));

      expect(res.status).toBe(200);
      expect(calls.update).toEqual([]);
      expect(calls.tagsDeleted).toBe(1);
      expect(calls.tagsInserted).toEqual([
        [
          { activity_id: ACT_ID, tag: "food" },
          { activity_id: ACT_ID, tag: "youth" },
        ],
      ]);
    });

    it("a participant count is written only when it is sent", async () => {
      const calls = patchWorld();
      await PATCH(patchRequest({ participant_count: 12 }), makeParams(ACT_ID));
      expect(calls.update).toEqual([{ participant_count: 12 }]);
    });
  });
});

describe("DELETE /api/activities/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`),
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeParams(ACT_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL("http://localhost/api/activities/bad-id"),
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("deletes activity successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: { org_id: "org-1" }, error: null }),
    };
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mockSupabase.from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(deleteChain);

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`),
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeParams(ACT_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
