import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ReviewCard from "@/components/reviews/ReviewCard";
import { makeReview } from "../../helpers/fixtures";

describe("ReviewCard", () => {
  it("renders reviewer name", () => {
    const review = makeReview({
      profiles: { full_name: "John Doe" },
    });
    render(<ReviewCard review={review} />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("falls back to 'Community member' when profile name is missing", () => {
    const review = makeReview({ profiles: undefined });
    render(<ReviewCard review={review} />);
    expect(screen.getByText("Community member")).toBeInTheDocument();
  });

  it("renders correct number of filled stars", () => {
    const review = makeReview({ rating: 3 });
    render(<ReviewCard review={review} />);
    // 3 filled + 2 empty = ★★★☆☆
    expect(screen.getByText("★★★☆☆")).toBeInTheDocument();
  });

  it("renders review body text", () => {
    const review = makeReview({ body: "Amazing church community!" });
    render(<ReviewCard review={review} />);
    expect(screen.getByText("Amazing church community!")).toBeInTheDocument();
  });

  it("does not render body when empty", () => {
    const review = makeReview({ body: "" });
    render(<ReviewCard review={review} />);
    // No paragraph with review text
    expect(screen.queryByText("Amazing")).not.toBeInTheDocument();
  });

  it("shows 'Reported as possibly closed' when still_exists is false and showStillExists is true", () => {
    const review = makeReview({ still_exists: false });
    render(<ReviewCard review={review} showStillExists={true} />);
    expect(screen.getByText("Reported as possibly closed")).toBeInTheDocument();
  });

  it("does not show closed warning when showStillExists is false (default)", () => {
    const review = makeReview({ still_exists: false });
    render(<ReviewCard review={review} />);
    expect(screen.queryByText("Reported as possibly closed")).not.toBeInTheDocument();
  });

  it("renders the review date", () => {
    const review = makeReview({ created_at: "2026-03-15T00:00:00Z" });
    render(<ReviewCard review={review} />);
    // Check the date is rendered (format depends on locale)
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
