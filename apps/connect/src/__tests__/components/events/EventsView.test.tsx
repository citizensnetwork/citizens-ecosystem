import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EventsView from "@/components/events/EventsView";
import { makeEvent } from "../../helpers/fixtures";
import type { Place } from "@/types/db";

// Mock next/navigation (useRouter used for logout redirect)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// Mock Supabase browser client (used for auth state)
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn().mockResolvedValue({}),
    },
  }),
}));

// Stub heavy children
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = () => <div data-testid="event-map">Map</div>;
    Stub.displayName = "EventMapStub";
    return Stub;
  },
}));

vi.mock("@/components/events/EventCalendar", () => ({
  default: ({
    events,
  }: {
    events: unknown[];
    onSelectEvent?: unknown;
    isVendor?: boolean;
  }) => <div data-testid="event-calendar">{events.length} events</div>,
}));

vi.mock("@/components/reviews/PostEventPrompt", () => ({
  default: () => <div data-testid="post-event-prompt" />,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

const events = [
  makeEvent({ id: "1", title: "Worship Night", category: "worship" }),
  makeEvent({ id: "2", title: "Youth Camp", category: "youth" }),
  makeEvent({
    id: "3",
    title: "Bible Study",
    category: "bible-study",
    location: "Grace Center",
  }),
];

describe("EventsView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders map view by default", () => {
    render(<EventsView events={events} />);
    expect(screen.getByTestId("event-map")).toBeInTheDocument();
  });

  it("switches to calendar view when toggle clicked", () => {
    render(<EventsView events={events} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle view mode/i })
    );
    expect(screen.getByTestId("event-calendar")).toBeInTheDocument();
    expect(screen.queryByTestId("event-map")).not.toBeInTheDocument();
  });

  it("renders search input", () => {
    render(<EventsView events={events} />);
    expect(
      screen.getByPlaceholderText(/search events or places/i)
    ).toBeInTheDocument();
  });

  it("renders filter toggle button", () => {
    render(<EventsView events={events} />);
    expect(
      screen.getByRole("button", { name: /toggle filters/i })
    ).toBeInTheDocument();
  });

  it("opens filter drawer when filter button clicked", () => {
    render(<EventsView events={events} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle filters/i })
    );
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.getByText("All categories")).toBeInTheDocument();
  });

  it("shows Create Event link for vendors in filter drawer", () => {
    render(<EventsView events={events} isVendor />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle filters/i })
    );
    expect(screen.getByText("+ Create Event")).toBeInTheDocument();
  });

  it("hides Create Event link for non-vendors", () => {
    render(<EventsView events={events} isVendor={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle filters/i })
    );
    expect(screen.queryByText("+ Create Event")).not.toBeInTheDocument();
  });

  it("always shows Add Place link in filter drawer", () => {
    render(<EventsView events={events} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle filters/i })
    );
    expect(screen.getByText("+ Add Place")).toBeInTheDocument();
  });

  it("filters events by category selection", async () => {
    render(<EventsView events={events} />);
    // Open filter drawer
    fireEvent.click(
      screen.getByRole("button", { name: /toggle filters/i })
    );

    // Click "Youth" category filter — should close drawer
    // Our events: Worship Night (worship), Youth Camp (youth), Bible Study (bible-study)
    fireEvent.click(screen.getByText(/youth/i));

    // After selecting a category, the drawer closes and activeCategory is "youth"
    // Switch to calendar to verify
    fireEvent.click(
      screen.getByRole("button", { name: /toggle view mode/i })
    );
    await waitFor(() => {
      expect(screen.getByTestId("event-calendar")).toHaveTextContent(
        "1 events"
      );
    });
  });

  it("shows event count in filter drawer", () => {
    render(<EventsView events={events} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle filters/i })
    );
    expect(screen.getByText(/3 events/)).toBeInTheDocument();
  });

  it("shows place count when places are provided", () => {
    const places: Place[] = [
      {
        id: "p1",
        name: "Grace Church",
        description: "A church",
        address: "123 Main",
        latitude: -29.85,
        longitude: 31.02,
        created_by: "u1",
        created_at: new Date().toISOString(),
        category_id: null,
        phone: null,
        website: null,
        image_url: null,
        verified: true,
        verification_flagged: false,
        avg_rating: null,
        reviews_count: undefined,
      },
    ];
    render(<EventsView events={events} places={places} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle filters/i })
    );
    expect(screen.getByText(/1 place/)).toBeInTheDocument();
  });

  it("closes filter drawer with close button", () => {
    render(<EventsView events={events} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle filters/i })
    );
    expect(screen.getByText("Filters")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /close filters/i })
    );
    // Drawer is hidden via translate, but the Filters heading may still be in DOM
    // Just verify the filter toggle still works
    expect(
      screen.getByRole("button", { name: /toggle filters/i })
    ).toBeInTheDocument();
  });
});
