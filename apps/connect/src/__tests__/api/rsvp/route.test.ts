import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

// Mock the server supabase client module
const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

// Must import AFTER the mock is set up
const { POST } = await import("@/app/api/rsvp/route");

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/rsvp", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/rsvp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await POST(makeRequest({ event_id: "event-123" }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when event_id is missing", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await POST(makeRequest({}));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("event_id is required");
  });

  it("returns 400 when event_id is not a string", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await POST(makeRequest({ event_id: 123 }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("event_id is required");
  });

  it("returns 404 when event does not exist", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    // First from() call is for events select — return null (not found)
    const eventsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockClient.from.mockReturnValueOnce(eventsChain);

    const response = await POST(makeRequest({ event_id: "nonexistent" }));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe("Event not found");
  });

  it("returns 201 on successful RSVP", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    // events select — event found, published, no capacity limit
    const eventsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "event-123", status: "published", max_attendees: null }, error: null }),
    };

    // rsvps insert — success
    const rsvpsChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    mockClient.from
      .mockReturnValueOnce(eventsChain)
      .mockReturnValueOnce(rsvpsChain);

    const response = await POST(makeRequest({ event_id: "event-123" }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.remaining).toBeNull();
  });

  it("returns 409 on duplicate RSVP", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const eventsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "event-123", status: "published", max_attendees: null }, error: null }),
    };

    const rsvpsChain = {
      insert: vi.fn().mockResolvedValue({
        error: { code: "23505", message: "duplicate key" },
      }),
    };

    mockClient.from
      .mockReturnValueOnce(eventsChain)
      .mockReturnValueOnce(rsvpsChain);

    const response = await POST(makeRequest({ event_id: "event-123" }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe("Already RSVPed to this event");
  });

  it("returns 500 on other database errors", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const eventsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "event-123", status: "published", max_attendees: null }, error: null }),
    };

    const rsvpsChain = {
      insert: vi.fn().mockResolvedValue({
        error: { code: "42000", message: "Something broke" },
      }),
    };

    mockClient.from
      .mockReturnValueOnce(eventsChain)
      .mockReturnValueOnce(rsvpsChain);

    const response = await POST(makeRequest({ event_id: "event-123" }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Something broke");
  });
});
