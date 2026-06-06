import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
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

vi.mock("@/components/events/EventFeed", () => ({
  default: ({ events }: { events: unknown[] }) => (
    <div data-testid="event-feed">{(events as { id: string }[]).length} items</div>
  ),
}));

vi.mock("@/lib/capacitor/share", () => ({
  share: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/hooks/useBurgerMenuData", () => ({
  useBurgerMenuData: () => ({
    incomingConvinceEventIds: new Set<string>(),
    profile: null,
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

  it("shows calendar over the map when ?view=calendar is set", async () => {
    mockSearchParams.set("view", "calendar");
    try {
      await renderView();
      expect(screen.getByTestId("glass-calendar")).toBeInTheDocument();
      expect(screen.getByTestId("event-map")).toBeInTheDocument();
    } finally {
      mockSearchParams.delete("view");
    }
  });

  it("renders search input with proper aria-label", async () => {
    await renderView();
    const input = screen.getByRole("searchbox", { name: /search the map/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-label", "Search the map");
  });

  it("renders the Figma map header (filter + profile)", async () => {
    await renderView();
    expect(
      screen.getByRole("button", { name: /filter the map/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /your profile/i })
    ).toBeInTheDocument();
  });

  it("filters events by the ?q= search query into the calendar", async () => {
    mockSearchParams.set("q", "Youth");
    mockSearchParams.set("view", "calendar");
    try {
      await renderView();
      await waitFor(() => {
        expect(screen.getByTestId("glass-calendar")).toHaveTextContent(
          "1 events"
        );
      });
    } finally {
      mockSearchParams.delete("q");
      mockSearchParams.delete("view");
    }
  });

  it("renders back-to-map button in calendar view", async () => {
    mockSearchParams.set("view", "calendar");
    try {
      await renderView();
      const backBtn = screen.getByRole("button", { name: /back to map/i });
      expect(backBtn).toBeInTheDocument();
      expect(backBtn.querySelector("svg")).toBeTruthy();
    } finally {
      mockSearchParams.delete("view");
    }
  });

  it("passes events to calendar view", async () => {
    mockSearchParams.set("view", "calendar");
    try {
      await renderView();
      expect(screen.getByTestId("glass-calendar")).toHaveTextContent("3 events");
    } finally {
      mockSearchParams.delete("view");
    }
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
