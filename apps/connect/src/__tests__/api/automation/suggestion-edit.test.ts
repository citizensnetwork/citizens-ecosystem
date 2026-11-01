import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { validateSuggestion } from "@/lib/automation/suggestions";
import { createFakeTables, type Row } from "../../helpers/fake-tables";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const SUG = "33333333-3333-4333-8333-333333333333";
const SRC = "https://www.church.example/events";

const fake = createFakeTables(["listing_suggestions"]);
const state = fake.state as { listing_suggestions: Row[] };

let caller: { id: string } | null = { id: OWNER };
const rpc = vi.fn();
// The caller's OWN session: reads go through it (RLS decides what it can see), and so does the write.
vi.mock("@/lib/supabase/route", () => ({
  getRouteAuth: vi.fn(async () => ({ supabase: { from: (t: string) => fake.from(t), rpc: (...a: unknown[]) => rpc(...a) }, user: caller })),
}));
// A service-role client must never be needed here: make any use of it fail loudly.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("the edit route must not use the service-role client");
  },
}));

const { PATCH } = await import("@/app/api/automation/suggestions/[id]/route");

const future = new Date(Date.now() + 5 * 86_400_000);
const startIso = future.toISOString();
const endIso = new Date(future.getTime() + 2 * 3_600_000).toISOString();
const stored = validateSuggestion(
  "event",
  { title: "Sunday Celebration", description: "Join us.", start: startIso, end: endIso, location: "12 Church Street", category: "church-services" },
  SRC,
);
if (!stored.ok) throw new Error("fixture");

const req = (body: unknown, id = SUG, raw?: string) =>
  PATCH(
    new NextRequest(`http://localhost/api/automation/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner-token" },
      body: raw ?? JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

/** What mig 199's edit_listing_suggestion promises, so the route is exercised against the same contract. */
function databaseFunction(_name: string, args: { _id: string; _payload: Row }) {
  const row = state.listing_suggestions.find((r) => r.id === args._id);
  if (!row || row.contributor_id !== caller?.id) return { data: { success: false, reason: "not_found" }, error: null };
  if (row.status !== "pending") return { data: { success: false, reason: "not_pending" }, error: null };
  row.payload = args._payload; // payload only
  return { data: { success: true, status: "pending" }, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  caller = { id: OWNER };
  state.listing_suggestions = [
    { id: SUG, contributor_id: OWNER, kind: "event", status: "pending", source_url: SRC, fingerprint: stored.fingerprint, payload: stored.payload },
  ];
  rpc.mockImplementation(async (name: string, args: { _id: string; _payload: Row }) => databaseFunction(name, args));
});

describe("PATCH /api/automation/suggestions/[id]: who may edit", () => {
  it("401 when signed out, and nothing is read or written", async () => {
    caller = null;
    const res = await req({ edits: { title: "Changed" } });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("400 for a malformed id, and 404 for an unknown one", async () => {
    expect((await req({ edits: { title: "Changed" } }, "nope")).status).toBe(400);
    expect((await req({ edits: { title: "Changed" } }, "44444444-4444-4444-8444-444444444444")).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("404 for someone else's suggestion: the database function refuses a stranger, and nothing is stored", async () => {
    // (in production RLS hides the row from a stranger first; the fake has no RLS, so this reaches the function)
    caller = { id: STRANGER };
    const res = await req({ edits: { title: "Changed" } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
    expect((state.listing_suggestions[0].payload as Row).title).toBe("Sunday Celebration");
  });

  it("429 when the owner edits far too fast", async () => {
    let last = 0;
    for (let i = 0; i < 40; i++) last = (await req({ edits: { title: `Change ${i + 100}` } })).status;
    expect(last).toBe(429);
  });
});

describe("PATCH /api/automation/suggestions/[id]: what may change", () => {
  it("stores the edit cleaned by the SAME rules as a suggestion from the Reader, and says what it stored", async () => {
    const res = await req({ edits: { title: "  Sunday  Celebration (new venue) ", description: "Ring Pastor Joe on 082 123 4567" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.payload).toMatchObject({ title: "Sunday Celebration (new venue)", description: "Ring Pastor Joe on [removed]", category: "church-services" });
    expect(body.warnings.join(" ")).toMatch(/removed/);
    expect(state.listing_suggestions[0].payload).toEqual(body.payload);
    expect(rpc).toHaveBeenCalledWith("edit_listing_suggestion", { _id: SUG, _payload: body.payload });
  });

  it("leaves the row's fingerprint, kind, status and source exactly as they were", async () => {
    const before = { ...state.listing_suggestions[0] };
    await req({ edits: { title: "A completely different title", start: new Date(future.getTime() + 86_400_000).toISOString() } });
    const after = state.listing_suggestions[0];
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.kind).toBe("event");
    expect(after.status).toBe("pending");
    expect(after.source_url).toBe(SRC);
    // and only `payload` was handed to the database
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual(["_id", "_payload"]);
  });

  it("moving the start moves the end with it", async () => {
    const moved = new Date(future.getTime() + 86_400_000);
    const body = await (await req({ edits: { start: moved.toISOString() } })).json();
    expect(body.payload.start).toBe(moved.toISOString());
    expect(body.payload.end).toBe(new Date(moved.getTime() + 2 * 3_600_000).toISOString());
  });

  it("422 with the rule's own reason for an edit the rules refuse, and nothing is stored", async () => {
    for (const [edits, reason] of [
      [{ title: "ab" }, "event_title_required"],
      [{ start: "tomorrow" }, "event_start_invalid"],
      [{ start: "2040-01-01T10:00:00Z" }, "event_start_out_of_range"],
      [{ category: "youth" }, "edit_field_not_allowed"],
      [{ status: "published" }, "edit_field_not_allowed"],
      [{}, "edit_is_empty"],
    ] as const) {
      const res = await req({ edits });
      expect(res.status, reason).toBe(422);
      expect((await res.json()).error, reason).toBe(reason);
    }
    expect(rpc).not.toHaveBeenCalled();
    expect((state.listing_suggestions[0].payload as Row).title).toBe("Sunday Celebration");
  });

  it("422 for a body with no edits object, and 400 / 413 for broken or oversized JSON", async () => {
    expect((await (await req({})).json()).error).toBe("edit_must_be_an_object");
    expect((await (await req({ edits: "title" })).json()).error).toBe("edit_must_be_an_object");
    expect((await req(null, SUG, "not json")).status).toBe(400);
    expect((await req(null, SUG, "x".repeat(60_000))).status).toBe(413);
  });

  it("edits a news post and a profile update the same way", async () => {
    const news = validateSuggestion("news", { title: "New building", body: "We open Sunday.", link: "https://www.church.example/n/1", post_date: "2026-10-03" }, SRC);
    const prof = validateSuggestion("profile", { field: "bio", value: "We serve Pretoria." }, SRC);
    if (!news.ok || !prof.ok) throw new Error("fixture");
    const N = "55555555-5555-4555-8555-555555555555";
    const P = "66666666-6666-4666-8666-666666666666";
    state.listing_suggestions.push(
      { id: N, contributor_id: OWNER, kind: "news", status: "pending", source_url: SRC, fingerprint: news.fingerprint, payload: news.payload },
      { id: P, contributor_id: OWNER, kind: "profile", status: "pending", source_url: SRC, fingerprint: prof.fingerprint, payload: prof.payload },
    );
    expect((await (await req({ edits: { body: "We open Sunday at nine." } }, N)).json()).payload).toMatchObject({ body: "We open Sunday at nine.", link: "https://www.church.example/n/1" });
    expect((await (await req({ edits: { value: "We serve the whole city." } }, P)).json()).payload).toEqual({ field: "bio", value: "We serve the whole city." });
    expect((await req({ edits: { field: "contact_email" } }, P)).status).toBe(422);
  });
});

describe("PATCH /api/automation/suggestions/[id]: only a waiting suggestion", () => {
  it("409 not_pending for one that was dismissed, published or auto-published, before any rule runs", async () => {
    for (const status of ["dismissed", "published", "auto_published", "superseded"]) {
      state.listing_suggestions[0].status = status;
      const res = await req({ edits: { title: "Changed" } });
      expect(res.status, status).toBe(409);
      expect((await res.json()).error, status).toBe("not_pending");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("409 when it is decided between the read and the write (the database function has the last word)", async () => {
    rpc.mockResolvedValueOnce({ data: { success: false, reason: "not_pending" }, error: null });
    const res = await req({ edits: { title: "Changed again" } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("not_pending");
  });

  it("404 when the database function says the caller is not allowed (a stranger or a viewer)", async () => {
    rpc.mockResolvedValueOnce({ data: { success: false, reason: "not_found" }, error: null });
    expect((await req({ edits: { title: "Changed again" } })).status).toBe(404);
  });
});

describe("PATCH /api/automation/suggestions/[id]: before migration 199 is applied", () => {
  it("answers 503 edit_unavailable, stores nothing, and touches nothing else", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function public.edit_listing_suggestion" } });
    const res = await req({ edits: { title: "Changed" } });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("edit_unavailable");
    expect((state.listing_suggestions[0].payload as Row).title).toBe("Sunday Celebration");
  });
});
