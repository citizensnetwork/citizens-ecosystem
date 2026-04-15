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

  it("renders 'RSVP / Attend' when user has not RSVPed", () => {
    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    expect(screen.getByText("RSVP / Attend")).toBeInTheDocument();
  });

  it("renders 'Cancel RSVP' when user has already RSVPed", () => {
    render(<RSVPButton eventId="event-1" hasRsvped={true} />);
    expect(screen.getByText("Cancel RSVP")).toBeInTheDocument();
  });

  it("redirects to login when user is not authenticated", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("calls POST /api/rsvp to create RSVP", async () => {
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
    // Don't resolve immediately to keep loading state
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<RSVPButton eventId="event-1" hasRsvped={false} />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Processing...")).toBeInTheDocument();
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
});
