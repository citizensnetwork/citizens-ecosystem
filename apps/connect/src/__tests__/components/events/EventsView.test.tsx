import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

vi.mock("@/components/events/GlassCalendar", () => ({
  default: ({
    events,
  }: {
    events: unknown[];
    onSelectEvent?: unknown;
    rsvpEventIds?: unknown;
    onClose?: () => void;
  }) => <div data-testid="glass-calendar">{events.length} events</div>,
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

vi.mock("@/lib/capacitor/share", () => ({
  share: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/hooks/useBurgerMenuData", () => ({
  useBurgerMenuData: () => ({
    trending: [],
    favouriteOrgs: [],
    friends: [],
    friendConsiderings: [],
    userConsidering: [],
    incomingConvinceEventIds: new Set<string>(),
    outgoingConvinceKeys: new Set<string>(),
    profile: null,
    loading: false,
    refetch: () => {},
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
  makeEvent({ id: "1", title: "Worship Night", category: "church-services" }),
  makeEvent({ id: "2", title: "Youth Camp", category: "kids" }),
  makeEvent({
    id: "3",
    title: "Bible Study",
    category: "education-equipping",
    location: "Grace Center",
  }),
];

describe("EventsView", () => {
  beforeEach(() => vi.clearAllMocks());

  async function renderView(props?: Partial<Parameters<typeof EventsView>[0]>) {
    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(<EventsView events={events} {...props} />);
    });
    return result;
  }

  it("renders map view by default", async () => {
    await renderView();
    expect(screen.getByTestId("event-map")).toBeInTheDocument();
  });

  it("switches to calendar view when toggle clicked", async () => {
    await renderView();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /toggle view mode/i }));
    });
    expect(screen.getByTestId("glass-calendar")).toBeInTheDocument();
    // Map is always rendered (visible behind transparent calendar) but non-interactive
    expect(screen.getByTestId("event-map")).toBeInTheDocument();
  });

  it("renders search input with proper aria-label", async () => {
    await renderView();
    // Bottom search starts collapsed as an icon button; open it first
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /open search/i }));
    });
    const input = screen.getByRole("searchbox", { name: /search events, places, or city/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-label", "Search events, places, or city");
  });

  it("renders toggle menu button", async () => {
    await renderView();
    expect(
      screen.getByRole("button", { name: /toggle menu/i })
    ).toBeInTheDocument();
  });

  it("opens burger menu when menu button clicked", async () => {
    await renderView();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
    });
    expect(screen.getByTestId("burger-menu")).toBeInTheDocument();
  });

  it("closes burger menu with close button", async () => {
    await renderView();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
    });
    expect(screen.getByTestId("burger-menu")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Close Menu"));
    });
    await waitFor(() => {
      expect(screen.queryByTestId("burger-menu")).not.toBeInTheDocument();
    });
  });

  it("filters events by search input", async () => {
    await renderView();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /toggle view mode/i }));
    });
    // Bottom search starts collapsed; open it before typing
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /open search/i }));
    });
    const input = screen.getByRole("searchbox", { name: /search events, places, or city/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Youth" } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("glass-calendar")).toHaveTextContent(
        "1 events"
      );
    });
  });

  it("renders Citizens Connect brand button with gold text", async () => {
    await renderView();
    const brandBtn = screen.getByRole("button", { name: "Citizens Connect" });
    expect(brandBtn).toBeInTheDocument();
    expect(brandBtn.className).toContain("text-(--gold)");
  });

  it("renders view toggle button with calendar icon on map view", async () => {
    await renderView();
    const toggleBtn = screen.getByRole("button", { name: /toggle view mode/i });
    expect(toggleBtn.querySelector("svg")).toBeTruthy();
  });

  it("renders view toggle button with map icon on calendar view", async () => {
    await renderView();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /toggle view mode/i }));
    });
    const toggleBtn = screen.getByRole("button", { name: /toggle view mode/i });
    expect(toggleBtn.querySelector("svg")).toBeTruthy();
  });

  it("passes events to calendar view", async () => {
    await renderView();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /toggle view mode/i }));
    });
    expect(screen.getByTestId("glass-calendar")).toHaveTextContent("3 events");
  });

  it("opens calendar automatically when ?view=calendar is set", async () => {
    mockSearchParams.set("view", "calendar");
    try {
      await renderView();
      expect(screen.getByTestId("glass-calendar")).toBeInTheDocument();
    } finally {
      mockSearchParams.delete("view");
    }
  });
});
