import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FollowPlaceButton from "@/components/places/FollowPlaceButton";

const mockRefresh = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

describe("FollowPlaceButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  it("renders Follow when not following", () => {
    render(
      <FollowPlaceButton placeId="p1" isFollowing={false} followerCount={5} />
    );
    const btn = screen.getByRole("button", { name: /follow/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("Follow");
    expect(btn).toHaveTextContent("5");
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("renders Following when already following", () => {
    render(
      <FollowPlaceButton placeId="p1" isFollowing={true} followerCount={10} />
    );
    const btn = screen.getByRole("button", { name: /following/i });
    expect(btn).toHaveTextContent("Following");
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("hides count when followerCount is 0", () => {
    render(
      <FollowPlaceButton placeId="p1" isFollowing={false} followerCount={0} />
    );
    expect(screen.getByRole("button")).toHaveTextContent("Follow");
    // No number visible
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("calls POST on follow and updates optimistically", async () => {
    render(
      <FollowPlaceButton placeId="p1" isFollowing={false} followerCount={3} />
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/place-follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: "p1" }),
      });
    });

    // Optimistic: now shows Following + count 4
    expect(screen.getByRole("button")).toHaveTextContent("Following");
    expect(screen.getByRole("button")).toHaveTextContent("4");
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("calls DELETE on unfollow and updates optimistically", async () => {
    render(
      <FollowPlaceButton placeId="p1" isFollowing={true} followerCount={5} />
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/place-follow", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: "p1" }),
      });
    });

    expect(screen.getByRole("button")).toHaveTextContent("Follow");
    expect(screen.getByRole("button")).toHaveTextContent("4");
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("redirects to login on 401", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    render(
      <FollowPlaceButton placeId="p1" isFollowing={false} followerCount={0} />
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});
