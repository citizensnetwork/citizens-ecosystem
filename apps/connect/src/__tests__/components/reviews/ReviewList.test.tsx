import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ReviewList from "@/components/reviews/ReviewList";
import { makeReview } from "../../helpers/fixtures";

const mockSelect = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: mockSelect,
    }),
  }),
}));

vi.mock("@/components/reviews/ReviewForm", () => ({
  default: () => <div data-testid="review-form">ReviewForm</div>,
}));

vi.mock("@/components/reviews/ReviewCard", () => ({
  default: ({ review }: { review: { id: string; rating: number } }) => (
    <div data-testid="review-card">{review.rating} stars</div>
  ),
}));

describe("ReviewList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  function setupQuery(reviews: ReturnType<typeof makeReview>[]) {
    // Chain: .select().order().eq() → data
    const eqFn = vi.fn().mockResolvedValue({ data: reviews });
    const orderFn = vi.fn().mockReturnValue({ eq: eqFn });
    mockSelect.mockReturnValue({ order: orderFn });
  }

  it("shows loading state initially", () => {
    // Never resolves so it stays in loading
    const eqFn = vi.fn().mockReturnValue(new Promise(() => {}));
    const orderFn = vi.fn().mockReturnValue({ eq: eqFn });
    mockSelect.mockReturnValue({ order: orderFn });
    mockGetUser.mockReturnValue(new Promise(() => {}));

    render(<ReviewList eventId="e1" />);
    expect(screen.getByText("Loading reviews...")).toBeInTheDocument();
  });

  it("shows 'No reviews yet' when empty", async () => {
    setupQuery([]);

    render(<ReviewList eventId="e1" />);

    await waitFor(() => {
      expect(screen.getByText("No reviews yet.")).toBeInTheDocument();
    });
  });

  it("renders review cards when reviews exist", async () => {
    setupQuery([
      makeReview({ id: "r1", rating: 5 }),
      makeReview({ id: "r2", rating: 3 }),
    ]);

    render(<ReviewList eventId="e1" />);

    await waitFor(() => {
      const cards = screen.getAllByTestId("review-card");
      expect(cards).toHaveLength(2);
    });
  });

  it("renders custom title", async () => {
    setupQuery([]);
    render(<ReviewList eventId="e1" title="Event Reviews" />);

    await waitFor(() => {
      expect(screen.getByText("Event Reviews")).toBeInTheDocument();
    });
  });

  it("renders average rating when reviews exist", async () => {
    setupQuery([
      makeReview({ id: "r1", rating: 4 }),
      makeReview({ id: "r2", rating: 2 }),
    ]);

    render(<ReviewList eventId="e1" />);

    await waitFor(() => {
      expect(screen.getByText("3.0")).toBeInTheDocument();
      expect(screen.getByText(/2 reviews/)).toBeInTheDocument();
    });
  });

  it("renders ReviewForm", async () => {
    setupQuery([]);
    render(<ReviewList eventId="e1" />);

    await waitFor(() => {
      expect(screen.getByTestId("review-form")).toBeInTheDocument();
    });
  });
});
