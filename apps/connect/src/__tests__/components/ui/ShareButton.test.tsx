import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ShareButton from "@/components/ui/ShareButton";

const mockShare = vi.fn();

vi.mock("@/lib/capacitor/share", () => ({
  share: (...args: unknown[]) => mockShare(...args),
}));

describe("ShareButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Share text by default", () => {
    render(<ShareButton title="Test Event" />);
    expect(screen.getByText("Share")).toBeInTheDocument();
  });

  it("calls share with title and current URL", async () => {
    mockShare.mockResolvedValue(true);

    render(<ShareButton title="Test Event" />);
    fireEvent.click(screen.getByText("Share"));

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Test Event" })
      );
    });
  });

  it("calls share with custom URL when provided", async () => {
    mockShare.mockResolvedValue(true);

    render(
      <ShareButton title="Test Event" url="https://example.com/event/1" />
    );
    fireEvent.click(screen.getByText("Share"));

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith({
        title: "Test Event",
        url: "https://example.com/event/1",
      });
    });
  });

  it("shows 'Copied' when share returns false (clipboard fallback)", async () => {
    mockShare.mockResolvedValue(false);

    render(<ShareButton title="Test" />);
    fireEvent.click(screen.getByText("Share"));

    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });

  it("does not show 'Copied' when native share was opened", async () => {
    mockShare.mockResolvedValue(true);

    render(<ShareButton title="Test" />);
    fireEvent.click(screen.getByText("Share"));

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalled();
    });
    expect(screen.getByText("Share")).toBeInTheDocument();
  });

  it("applies custom className when provided", () => {
    render(<ShareButton title="Test" className="custom-class" />);
    const btn = screen.getByText("Share");
    expect(btn).toHaveClass("custom-class");
  });
});
