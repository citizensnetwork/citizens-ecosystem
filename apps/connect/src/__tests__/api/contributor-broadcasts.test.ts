import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/rate-limit";

type ChainResult = { data?: unknown; error?: unknown; count?: number };

function chain(result: ChainResult = { data: null, error: null }) {
  const c: Record<string, ReturnType<typeof vi.fn> | unknown> = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: ChainResult) => void) => Promise.resolve(result).then(resolve),
  };
  for (const key of ["select", "insert", "update", "delete", "eq", "in", "is", "order", "limit"]) {
    (c[key] as ReturnType<typeof vi.fn>).mockReturnValue(c);
  }
  return c;
}

const mockClient = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}));

const mockAdminNotifications = vi.hoisted(() => chain({ data: null, error: null }));
const mockAdmin = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "notifications") return mockAdminNotifications;
    return chain();
  }),
}));

const accessMock = vi.hoisted(() => vi.fn());
const activityMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdmin),
}));
vi.mock("@/lib/dashboard/access", () => ({
  checkDashboardAccess: accessMock,
}));
vi.mock("@/lib/dashboard/activity", () => ({
  recordContributorMutation: activityMock,
}));

const { POST } = await import("@/app/api/contributor/[handle]/broadcasts/route");

const CONTRIBUTOR_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const PLACE_ID = "44444444-4444-4444-8444-444444444444";
const BROADCAST_ID = "55555555-5555-4555-8555-555555555555";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/contributor/test/broadcasts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ handle: "test" }) };
}

function setupBase(tableMap: Record<string, ReturnType<typeof chain>>) {
  accessMock.mockResolvedValue({
    hasAccess: true,
    isOwner: true,
    isAdminWithAccess: false,
    contributorId: CONTRIBUTOR_ID,
  });
  mockClient.auth.getUser.mockResolvedValue({
    data: { user: { id: CONTRIBUTOR_ID } },
    error: null,
  });
  mockClient.from.mockImplementation((table: string) => tableMap[table] ?? chain());
  activityMock.mockResolvedValue(undefined);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

describe("POST /api/contributor/[handle]/broadcasts notification fan-out", () => {
  it("notifies attending and considering event users through the admin client", async () => {
    const eventChain = chain({ data: { created_by: CONTRIBUTOR_ID }, error: null });
    const broadcastChain = chain({ data: { id: BROADCAST_ID, body: "Update", created_at: "now" }, error: null });
    const rsvpChain = chain({
      data: [{ user_id: USER_ID }, { user_id: CONTRIBUTOR_ID }],
      error: null,
    });
    setupBase({ events: eventChain, broadcast_messages: broadcastChain, rsvps: rsvpChain });

    const res = await POST(
      req({ entity_type: "event", entity_id: EVENT_ID, body: "Update" }),
      params(),
    );

    expect(res.status).toBe(201);
    expect(rsvpChain.in).toHaveBeenCalledWith("status", ["attending", "considering"]);
    expect(mockClient.from).not.toHaveBeenCalledWith("notifications");
    expect(mockAdmin.from).toHaveBeenCalledWith("notifications");
    expect(mockAdminNotifications.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: USER_ID,
        type: "broadcast_sent",
        data: expect.objectContaining({ url: `/events/${EVENT_ID}` }),
      }),
    ]);
  });

  it("notifies place followers and contributor followers once", async () => {
    const placeChain = chain({ data: { created_by: CONTRIBUTOR_ID }, error: null });
    const broadcastChain = chain({ data: { id: BROADCAST_ID, body: "Place update", created_at: "now" }, error: null });
    const placeFollowChain = chain({ data: [{ user_id: USER_ID }], error: null });
    const contributorFollowChain = chain({
      data: [{ follower_id: USER_ID }, { follower_id: "66666666-6666-4666-8666-666666666666" }],
      error: null,
    });
    setupBase({
      places: placeChain,
      broadcast_messages: broadcastChain,
      place_follows: placeFollowChain,
      follows: contributorFollowChain,
    });

    const res = await POST(
      req({ entity_type: "place", entity_id: PLACE_ID, body: "Place update" }),
      params(),
    );

    expect(res.status).toBe(201);
    expect(placeFollowChain.eq).toHaveBeenCalledWith("place_id", PLACE_ID);
    expect(contributorFollowChain.eq).toHaveBeenCalledWith("followee_id", CONTRIBUTOR_ID);
    expect(mockAdminNotifications.insert).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: USER_ID }),
      expect.objectContaining({ user_id: "66666666-6666-4666-8666-666666666666" }),
    ]);
  });
});
