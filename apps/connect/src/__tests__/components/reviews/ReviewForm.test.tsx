import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReviewForm from "@/components/reviews/ReviewForm";
import type { User } from "@supabase/supabase-js";

const mockUpsert = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      upsert: mockUpsert,
    }),
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

const user = { id: "user-123" } as User;

describe("ReviewForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows login prompt when user is null", () => {
    render(<ReviewForm user={null} eventId="e1" />);
    expect(screen.getByText(/log in/i)).toBeInTheDocument();
    expect(screen.getByText(/to add a review/i)).toBeInTheDocument();
  });

  it("renders form heading for authenticated user", () => {
    render(<ReviewForm user={user} eventId="e1" />);
    expect(screen.getByText("Share your experience")).toBeInTheDocument();
  });

  it("renders 5 star buttons", () => {
    render(<ReviewForm user={user} eventId="e1" />);
    const stars = screen.getAllByRole("button", { name: /rate \d star/i });
    expect(stars).toHaveLength(5);
  });

  it("renders textarea for optional comment", () => {
    render(<ReviewForm user={user} eventId="e1" />);
    expect(
      screen.getByPlaceholderText("Optional comment")
    ).toBeInTheDocument();
  });

  it("renders Submit review button", () => {
    render(<ReviewForm user={user} eventId="e1" />);
    expect(
      screen.getByRole("button", { name: /submit review/i })
    ).toBeInTheDocument();
  });

  it("shows 'still exists' checkbox for place reviews", () => {
    render(<ReviewForm user={user} placeId="p1" />);
    expect(
      screen.getByLabelText(/this place still exists/i)
    ).toBeInTheDocument();
  });

  it("hides 'still exists' checkbox for event reviews", () => {
    render(<ReviewForm user={user} eventId="e1" />);
    expect(
      screen.queryByLabelText(/this place still exists/i)
    ).not.toBeInTheDocument();
  });

  it("submits review with rating and body", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const onSubmitted = vi.fn();

    render(
      <ReviewForm user={user} eventId="e1" onSubmitted={onSubmitted} />
    );

    // click 4th star
    fireEvent.click(screen.getByRole("button", { name: "Rate 4 stars" }));
    // type comment
    fireEvent.change(screen.getByPlaceholderText("Optional comment"), {
      target: { value: "Great event!" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /submit review/i })
    );

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: "e1",
          user_id: "user-123",
          rating: 4,
          body: "Great event!",
        }),
        expect.any(Object)
      );
      expect(onSubmitted).toHaveBeenCalled();
    });
  });

  it("shows error on upsert failure", async () => {
    mockUpsert.mockResolvedValue({
      error: { message: "Permission denied" },
    });

    render(<ReviewForm user={user} eventId="e1" />);
    fireEvent.click(
      screen.getByRole("button", { name: /submit review/i })
    );

    await waitFor(() => {
      expect(screen.getByText("Permission denied")).toBeInTheDocument();
    });
  });

  it("shows Saving... during submission", async () => {
    mockUpsert.mockReturnValue(new Promise(() => {}));

    render(<ReviewForm user={user} eventId="e1" />);
    fireEvent.click(
      screen.getByRole("button", { name: /submit review/i })
    );

    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });
});
