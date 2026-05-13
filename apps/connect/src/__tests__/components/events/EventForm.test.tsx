import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EventForm from "@/components/events/EventForm";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockGetUser = vi.fn();
const mockInsert = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      insert: mockInsert,
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

// Mock dynamic import for LocationPicker
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = (props: { position: unknown; onSelect: (lat: number, lng: number) => void }) => (
      <button
        data-testid="location-picker"
        onClick={() => props.onSelect(-29.8587, 31.0218)}
      >
        Pick Location
      </button>
    );
    Stub.displayName = "LocationPickerStub";
    return Stub;
  },
}));

describe("EventForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all form fields", () => {
    render(<EventForm />);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
  });

  it("renders Create Event heading", () => {
    render(<EventForm />);
    expect(screen.getByRole("heading", { name: "Create Event" })).toBeInTheDocument();
  });

  it("renders submit button with correct text", () => {
    render(<EventForm />);
    expect(
      screen.getByRole("button", { name: /create event/i })
    ).toBeInTheDocument();
  });

  it("renders all 17 category options", () => {
    render(<EventForm />);
    const select = screen.getByLabelText(/category/i) as HTMLSelectElement;
    expect(select.options).toHaveLength(17);
  });

  it("shows error when not logged in on submit", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<EventForm />);

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Test Event" },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "A test description" },
    });
    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: "2026-04-20T10:00" },
    });
    fireEvent.change(screen.getByLabelText(/location/i), {
      target: { value: "Durban" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => {
      expect(
        screen.getByText("You must be logged in to create an event.")
      ).toBeInTheDocument();
    });
  });

  it("submits event and shows Published success screen", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "new-event-1" }, error: null }),
      }),
    });

    render(<EventForm />);

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Sunday Service" },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Weekly worship" },
    });
    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: "2026-04-20T10:00" },
    });
    fireEvent.change(screen.getByLabelText(/location/i), {
      target: { value: "Grace Church" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => {
      expect(screen.getByText("Published!")).toBeInTheDocument();
    });
    expect(mockRefresh).toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: /view event/i })
    ).toHaveAttribute("href", "/events/new-event-1");
  });

  it("shows error message on DB insert failure", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "Permission denied" } }),
      }),
    });

    render(<EventForm />);

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Desc" },
    });
    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: "2026-04-20T10:00" },
    });
    fireEvent.change(screen.getByLabelText(/location/i), {
      target: { value: "Somewhere" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => {
      expect(screen.getByText("Permission denied")).toBeInTheDocument();
    });
  });

  it("shows loading state during submission", async () => {
    mockGetUser.mockReturnValue(new Promise(() => {}));

    render(<EventForm />);

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Desc" },
    });
    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: "2026-04-20T10:00" },
    });
    fireEvent.change(screen.getByLabelText(/location/i), {
      target: { value: "Somewhere" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    expect(screen.getByText(/Creating/i)).toBeInTheDocument();
  });
});
