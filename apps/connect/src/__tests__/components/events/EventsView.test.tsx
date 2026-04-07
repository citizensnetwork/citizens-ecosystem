import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { forwardRef } from "react";
import EventsView from "@/components/events/EventsView";
import { makeEvent } from "../../helpers/fixtures";

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

// Mock Supabase browser client
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

vi.mock("@/components/events/BurgerMenu", () => {
  return {
    default: forwardRef(function BurgerMenuStub(
      { isOpen, onClose }: { isOpen: boolean; onClose: () => void },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _ref: React.Ref<HTMLElement>
    ) {
      return isOpen ? (
        <div data-testid="burger-menu">
          <button onClick={onClose}>Close Menu</button>
        </div>
      ) : null;
    }),
  };
});

vi.mock("@/components/events/EventFeed", () => ({
  default: ({ events }: { events: unknown[] }) => (
    <div data-testid="event-feed">{(events as { id: string }[]).length} items</div>
  ),
}));

vi.mock("@/components/reviews/PostEventPrompt", () => ({
  default: () => <div data-testid="post-event-prompt" />,
}));

vi.mock("@/components/notifications/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}));

vi.mock("@/hooks/useBurgerMenuData", () => ({
  useBurgerMenuData: () => ({
    trending: [],
    favouriteOrgs: [],
    friends: [],
    profile: null,
    loading: false,
  }),
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

  it("renders search input with proper aria-label", () => {
    render(<EventsView events={events} />);
    const input = screen.getByPlaceholderText(/search events or places/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-label", "Search events, places, or city");
  });

  it("renders toggle menu button", () => {
    render(<EventsView events={events} />);
    expect(
      screen.getByRole("button", { name: /toggle menu/i })
    ).toBeInTheDocument();
  });

  it("opens burger menu when menu button clicked", () => {
    render(<EventsView events={events} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle menu/i })
    );
    expect(screen.getByTestId("burger-menu")).toBeInTheDocument();
  });

  it("closes burger menu with close button", async () => {
    render(<EventsView events={events} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle menu/i })
    );
    expect(screen.getByTestId("burger-menu")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Close Menu"));
    await waitFor(() => {
      expect(screen.queryByTestId("burger-menu")).not.toBeInTheDocument();
    });
  });

  it("filters events by search input", async () => {
    render(<EventsView events={events} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle view mode/i })
    );
    const input = screen.getByPlaceholderText(/search events or places/i);
    fireEvent.change(input, { target: { value: "Youth" } });

    await waitFor(() => {
      expect(screen.getByTestId("event-calendar")).toHaveTextContent(
        "1 events"
      );
    });
  });

  it("shows events at a glance button", () => {
    render(<EventsView events={events} />);
    expect(
      screen.getByRole("button", { name: /events at a glance/i })
    ).toBeInTheDocument();
  });

  it("renders Citizens Connect brand link to /events", () => {
    render(<EventsView events={events} />);
    const brandLink = screen.getByText("Citizens Connect");
    expect(brandLink.closest("a")).toHaveAttribute("href", "/events");
  });

  it("renders view toggle button with calendar icon on map view", () => {
    render(<EventsView events={events} />);
    const toggleBtn = screen.getByRole("button", { name: /toggle view mode/i });
    expect(toggleBtn.querySelector("svg")).toBeTruthy();
  });

  it("renders view toggle button with map icon on calendar view", () => {
    render(<EventsView events={events} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle view mode/i })
    );
    const toggleBtn = screen.getByRole("button", { name: /toggle view mode/i });
    expect(toggleBtn.querySelector("svg")).toBeTruthy();
  });

  it("passes events to calendar view", async () => {
    render(<EventsView events={events} />);
    fireEvent.click(
      screen.getByRole("button", { name: /toggle view mode/i })
    );
    expect(screen.getByTestId("event-calendar")).toHaveTextContent("3 events");
  });
});
