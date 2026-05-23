import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RSVPButton from "@/components/events/RSVPButton";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("RSVPButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper: queue a "waiver already signed" response as the first fetch call
   * so that the pre-flight template lookup passes and the test moves straight
   * on to the POST /api/rsvp call.
   */
  function queueWaiverSigned() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          template: { id: "tpl-1", slug: "attendee-participation-waiver" },
          hasSigned: true,
        }),
    });
  }

  it("renders 'RSVP / Attend' when user has not RSVPed", () => {
    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    expect(screen.getByText("RSVP / Attend")).toBeInTheDocument();
  });

  it("renders 'Cancel RSVP' when user has already RSVPed", () => {
    render(<RSVPButton eventId="event-1" hasRsvped={true} />);
    expect(screen.getByText("Cancel RSVP")).toBeInTheDocument();
  });

  it("redirects to login when user is not authenticated", async () => {
    queueWaiverSigned();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("calls POST /api/rsvp to create RSVP", async () => {
    queueWaiverSigned();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, needsProfileSetup: false }),
    });

    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: "event-1" }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Cancel RSVP")).toBeInTheDocument();
    });
  });

  it("calls DELETE /api/rsvp to cancel RSVP", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<RSVPButton eventId="event-1" hasRsvped={true} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/rsvp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: "event-1" }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText("RSVP / Attend")).toBeInTheDocument();
    });
  });

  it("shows Processing... while loading", async () => {
    // Don't resolve the pre-flight waiver lookup to keep the loading state
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  it("opens the participation waiver modal on first RSVP (not yet signed)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          template: {
            id: "tpl-1",
            slug: "attendee-participation-waiver",
            title: "Event Participation Waiver",
            body: "Waiver body text.",
            version: 1,
          },
          hasSigned: false,
        }),
    });

    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /event participation waiver/i }),
      ).toBeInTheDocument();
    });
    // /api/rsvp must NOT have been called yet
    const rsvpCalls = mockFetch.mock.calls.filter(
      ([url]) => url === "/api/rsvp",
    );
    expect(rsvpCalls).toHaveLength(0);
  });

  it("skips waiver and RSVPs immediately when template is missing (graceful degrade)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/rsvp",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("applies gold styling when not RSVPed", () => {
    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-(--gold)");
  });

  it("applies red styling when RSVPed", () => {
    render(<RSVPButton eventId="event-1" hasRsvped={true} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-red-100");
  });

  it("surfaces a 409 capacity-full error to the user", async () => {
    queueWaiverSigned();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: "Event is full" }),
    });

    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Event is full");
    });
    // Still shows RSVP CTA — no optimistic flip on failure.
    expect(screen.getByText("RSVP / Attend")).toBeInTheDocument();
  });

  it("surfaces a 429 rate-limited error with a friendly fallback", async () => {
    queueWaiverSigned();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
    });

    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too many requests/i);
    });
  });

  it("surfaces a DELETE failure when cancelling RSVP", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    render(<RSVPButton eventId="event-1" hasRsvped={true} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /couldn't cancel rsvp/i,
      );
    });
    expect(screen.getByText("Cancel RSVP")).toBeInTheDocument();
  });
});
