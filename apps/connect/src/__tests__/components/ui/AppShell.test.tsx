import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppShell from "@/components/ui/AppShell";
import type { User } from "@supabase/supabase-js";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockPathname = vi.fn().mockReturnValue("/profile");
const mockGetUser = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({});
const mockOnAuthStateChange = vi.fn().mockReturnValue({
  data: { subscription: { unsubscribe: vi.fn() } },
});
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => mockPathname(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
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
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybeSingle }),
      }),
    }),
  }),
}));

// MessagesPanel chains supabase + realtime; not under test here.
vi.mock("@/components/messaging/MessagesPanel", () => ({
  default: () => <div data-testid="messages-panel" />,
}));

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/profile");
    mockMaybeSingle.mockResolvedValue({ data: null });
    // Counts fetch — keep it inert.
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
  });

  it("renders nothing on the landing route", () => {
    mockPathname.mockReturnValue("/");
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { container } = render(<AppShell />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing on the login route", () => {
    mockPathname.mockReturnValue("/login");
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { container } = render(<AppShell />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the brand and core destinations on a normal route", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    render(<AppShell />);
    expect(screen.getByText("Citizens")).toBeInTheDocument();
    // Labels appear in both the desktop sidebar and the mobile bottom bar.
    for (const label of ["Discover", "Kingdom Projects", "Dashboard"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows Log In and Sign Up when not authenticated", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    render(<AppShell />);
    expect(screen.getByText("Log In")).toBeInTheDocument();
    expect(screen.getByText("Sign Up")).toBeInTheDocument();
  });

  it("links Discover to /events", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    render(<AppShell />);
    const discover = screen.getAllByRole("link", { name: /discover/i });
    expect(discover.some((a) => a.getAttribute("href") === "/events")).toBe(true);
  });

  it("shows the user initial and Log Out when authenticated", async () => {
    const user = {
      id: "u1",
      email: "john@example.com",
      user_metadata: { full_name: "John Doe" },
    } as unknown as User;
    mockGetUser.mockResolvedValue({ data: { user } });
    render(<AppShell />);
    await waitFor(() => expect(screen.getByText("J")).toBeInTheDocument());
    expect(screen.getByText("Log Out")).toBeInTheDocument();
  });

  it("signs out and redirects home on Log Out", async () => {
    const user = {
      id: "u1",
      email: "john@example.com",
      user_metadata: { full_name: "John" },
    } as unknown as User;
    mockGetUser.mockResolvedValue({ data: { user } });
    const ue = userEvent.setup();
    render(<AppShell />);
    await waitFor(() => expect(screen.getByText("Log Out")).toBeInTheDocument());
    await ue.click(screen.getByText("Log Out"));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
