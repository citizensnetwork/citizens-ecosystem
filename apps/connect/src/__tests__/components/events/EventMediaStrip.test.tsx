import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EventMediaStrip from "@/components/events/EventMediaStrip";
import type { EventMedia } from "@/types/db";

// Next/Image stub so jsdom doesn't fail on fill/sizes props
vi.mock("next/image", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt ?? ""} src={props.src} />;
  },
}));

const baseMedia: EventMedia = {
  id: "m1",
  event_id: "e1",
  url: "https://example.com/a.jpg",
  kind: "image",
  thumbnail_url: null,
  title: null,
  sort_order: 0,
  uploaded_by: "u1",
  created_at: "2026-04-01T00:00:00Z",
};

describe("EventMediaStrip", () => {
  it("renders nothing when media is empty", () => {
    const { container } = render(<EventMediaStrip media={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a thumbnail per media item", () => {
    render(
      <EventMediaStrip
        media={[
          baseMedia,
          { ...baseMedia, id: "m2", kind: "video", url: "https://example.com/v.mp4" },
        ]}
      />
    );
    expect(screen.getAllByRole("button", { name: /Open/ })).toHaveLength(2);
  });

  it("opens the lightbox when a thumbnail is clicked and closes on Escape", () => {
    render(<EventMediaStrip media={[baseMedia]} />);
    fireEvent.click(screen.getByRole("button", { name: /Open gallery item 1/ }));
    expect(screen.getByRole("dialog", { name: /Gallery viewer/ })).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /Gallery viewer/ })).toBeNull();
  });

  it("navigates with arrow keys when multiple items are present", () => {
    render(
      <EventMediaStrip
        media={[
          { ...baseMedia, id: "m1", title: "First" },
          { ...baseMedia, id: "m2", title: "Second" },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open First" }));
    expect(screen.getAllByText("First").length).toBeGreaterThan(0);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getAllByText("Second").length).toBeGreaterThan(0);
  });
});
