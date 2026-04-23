import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import TermsAcceptanceGate from "@/components/ui/TermsAcceptanceGate";

const mockGetUser = vi.fn();
const mockProfileSingle = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockProfileSingle,
    })),
  }),
}));

const mockFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockFetch;

describe("TermsAcceptanceGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing for signed-out users", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    render(<TermsAcceptanceGate />);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("renders nothing when user has already accepted", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: { terms_accepted_at: "2025-01-01T00:00:00Z", full_name: "x" },
      error: null,
    });
    render(<TermsAcceptanceGate />);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("renders blocking dialog when terms_accepted_at is null", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: { terms_accepted_at: null, full_name: "Thandi" },
      error: null,
    });
    render(<TermsAcceptanceGate />);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByText(/accept the terms/i)).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/full name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Thandi");
  });

  it("submits acceptance and dismisses dialog on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: { terms_accepted_at: null, full_name: "" },
      error: null,
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Accepted" }),
    });

    render(<TermsAcceptanceGate />);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Test Name" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /agree & continue/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/terms/accept",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const call = mockFetch.mock.calls[0][1];
    expect(JSON.parse(call.body)).toEqual({ full_name: "Test Name" });
  });
});
