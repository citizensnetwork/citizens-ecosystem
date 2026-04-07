import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Navbar from "@/components/ui/Navbar";
import type { User } from "@supabase/supabase-js";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockPathname = vi.fn().mockReturnValue("/");
const mockGetUser = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({});
const mockOnAuthStateChange = vi.fn().mockReturnValue({
  data: { subscription: { unsubscribe: vi.fn() } },
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => mockPathname(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      signOut: mockSignOut,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

// Mock NotificationBell — it uses supabase.channel() and fetch() which aren't available in tests
vi.mock("@/components/notifications/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}));

describe("Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/");
  });

  it("renders null on /events page", () => {
    mockPathname.mockReturnValue("/events");
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { container } = render(<Navbar />);
    expect(container.innerHTML).toBe("");
  });

  it("renders brand name", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<Navbar />);
    expect(screen.getByText("Citizens Connect")).toBeInTheDocument();
  });

  it("renders Events link", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<Navbar />);
    const eventsLink = screen.getByText("Events");
    expect(eventsLink.closest("a")).toHaveAttribute("href", "/events?view=calendar");
  });

  it("shows Log In and Sign Up links when not authenticated", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<Navbar />);
    expect(screen.getByText("Log In")).toBeInTheDocument();
    expect(screen.getByText("Sign Up")).toBeInTheDocument();
  });

  it("shows user display name when authenticated", async () => {
    const user = {
      id: "u1",
      user_metadata: { full_name: "John Doe" },
    } as unknown as User;
    mockGetUser.mockResolvedValue({ data: { user } });

    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByText("John")).toBeInTheDocument();
    });
  });

  it("shows user initial avatar when authenticated", async () => {
    const user = {
      id: "u1",
      user_metadata: { full_name: "Sarah Smith" },
    } as unknown as User;
    mockGetUser.mockResolvedValue({ data: { user } });

    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByText("S")).toBeInTheDocument();
    });
  });

  it("opens dropdown menu on user button click", async () => {
    const user = {
      id: "u1",
      user_metadata: { full_name: "John" },
    } as unknown as User;
    mockGetUser.mockResolvedValue({ data: { user } });

    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByText("John")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("John"));

    expect(screen.getByText("My Profile")).toBeInTheDocument();
    expect(screen.getByText("Log Out")).toBeInTheDocument();
  });

  it("calls signOut and redirects on Log Out click", async () => {
    const user = {
      id: "u1",
      user_metadata: { full_name: "John" },
    } as unknown as User;
    mockGetUser.mockResolvedValue({ data: { user } });

    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByText("John")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("John"));
    fireEvent.click(screen.getByText("Log Out"));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
