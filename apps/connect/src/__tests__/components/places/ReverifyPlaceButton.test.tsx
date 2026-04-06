import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReverifyPlaceButton from "@/components/places/ReverifyPlaceButton";

const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
const mockRefresh = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ update: mockUpdate }),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe("ReverifyPlaceButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders button with correct text", () => {
    render(<ReverifyPlaceButton placeId="p1" />);
    expect(
      screen.getByRole("button", { name: /confirm place still exists/i })
    ).toBeInTheDocument();
  });

  it("calls supabase update on click", async () => {
    render(<ReverifyPlaceButton placeId="p1" />);
    fireEvent.click(
      screen.getByRole("button", { name: /confirm place still exists/i })
    );

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        verified: true,
        verification_flagged: false,
      });
      expect(mockEq).toHaveBeenCalledWith("id", "p1");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("shows Updating... during save", async () => {
    mockEq.mockReturnValue(new Promise(() => {}));

    render(<ReverifyPlaceButton placeId="p1" />);
    fireEvent.click(
      screen.getByRole("button", { name: /confirm place still exists/i })
    );

    expect(screen.getByText("Updating...")).toBeInTheDocument();
  });
});
