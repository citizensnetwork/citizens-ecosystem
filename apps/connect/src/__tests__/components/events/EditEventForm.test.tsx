import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditEventForm from "@/components/events/EditEventForm";
import { makeEvent } from "../../helpers/fixtures";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockGetUser = vi.fn();
const mockUpdate = vi.fn();
const mockDeleteEq = vi.fn().mockResolvedValue({ error: null });
const mockDeleteFn = vi.fn().mockReturnValue({ eq: mockDeleteEq });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const mediaChain = {
      order: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return {
      auth: { getUser: mockGetUser },
      from: () => ({
        update: mockUpdate,
        delete: mockDeleteFn,
        insert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockReturnValue(mediaChain),
        }),
      }),
      storage: {
        from: () => ({
          upload: vi.fn().mockResolvedValue({ error: null }),
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: "https://example.com/img.jpg" },
          }),
        }),
      },
    };
  },
}));

// Mock dynamic import for LocationPicker
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = () => <div data-testid="location-picker">Map</div>;
    Stub.displayName = "LocationPickerStub";
    return Stub;
  },
}));

// Mock confirm dialog
globalThis.confirm = vi.fn();

describe("EditEventForm", () => {
  const event = makeEvent({
    id: "event-123",
    title: "Sunday Service",
    description: "Weekly worship",
    date: "2026-04-12T09:00:00Z",
    location: "Grace Church",
    category: "church",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pre-fills form with event data", () => {
    render(<EditEventForm event={event} />);
    expect(screen.getByLabelText(/title/i)).toHaveValue("Sunday Service");
    expect(screen.getByLabelText(/description/i)).toHaveValue("Weekly worship");
    expect(screen.getByLabelText(/location/i)).toHaveValue("Grace Church");
  });

  it("renders Edit Event heading", () => {
    render(<EditEventForm event={event} />);
    expect(screen.getByText("Edit Event")).toBeInTheDocument();
  });

  it("renders Save Changes button", () => {
    render(<EditEventForm event={event} />);
    expect(
      screen.getByRole("button", { name: /save changes/i })
    ).toBeInTheDocument();
  });

  it("renders Delete Event button", () => {
    render(<EditEventForm event={event} />);
    expect(
      screen.getByRole("button", { name: /delete event/i })
    ).toBeInTheDocument();
  });

  it("shows error when not logged in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<EditEventForm event={event} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText("Not logged in.")).toBeInTheDocument();
    });
  });

  it("updates event and redirects on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "vendor-444-555-666" } },
    });
    const updateChain = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mockUpdate.mockReturnValue(updateChain);

    render(<EditEventForm event={event} />);

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Updated Service" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/events/event-123");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("shows error on update failure", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "vendor-444-555-666" } },
    });
    const updateChain = {
      eq: vi.fn().mockResolvedValue({ error: { message: "RLS blocked" } }),
    };
    mockUpdate.mockReturnValue(updateChain);

    render(<EditEventForm event={event} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText("RLS blocked")).toBeInTheDocument();
    });
  });

  it("prompts confirm before deleting", async () => {
    (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);

    render(<EditEventForm event={event} />);
    fireEvent.click(screen.getByRole("button", { name: /delete event/i }));

    expect(globalThis.confirm).toHaveBeenCalledWith(
      "Delete this event? This cannot be undone."
    );
    expect(mockDeleteFn).not.toHaveBeenCalled();
  });

  it("deletes event and redirects when confirmed", async () => {
    (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);

    render(<EditEventForm event={event} />);
    fireEvent.click(screen.getByRole("button", { name: /delete event/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/events");
    });
  });

  it("shows Saving… during update submission", async () => {
    mockGetUser.mockReturnValue(new Promise(() => {}));

    render(<EditEventForm event={event} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });
});
