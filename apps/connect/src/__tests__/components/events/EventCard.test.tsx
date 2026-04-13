import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EventCard from "@/components/events/EventCard";
import { makeEvent } from "../../helpers/fixtures";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

describe("EventCard", () => {
  it("renders event title", () => {
    const event = makeEvent({ title: "Worship Night" });
    render(<EventCard event={event} />);
    expect(screen.getByText("Worship Night")).toBeInTheDocument();
  });

  it("renders event location", () => {
    const event = makeEvent({ location: "Grace Church, Durban" });
    render(<EventCard event={event} />);
    expect(screen.getByText("Grace Church, Durban")).toBeInTheDocument();
  });

  it("renders category badge when category exists", () => {
    const event = makeEvent({ category: "entertainment", location: "City Hall" });
    render(<EventCard event={event} />);
    expect(screen.getByText("Entertainment")).toBeInTheDocument();
  });

  it("links to the event detail page", () => {
    const event = makeEvent({ id: "event-xyz" });
    render(<EventCard event={event} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/events/event-xyz");
  });

  it("renders cover image when image_url is provided", () => {
    const event = makeEvent({ image_url: "https://example.com/photo.jpg", title: "Bible Study" });
    render(<EventCard event={event} />);
    const img = screen.getByAltText("Bible Study");
    expect(img).toBeInTheDocument();
  });

  it("does not render image when image_url is null", () => {
    const event = makeEvent({ image_url: null, title: "Prayer Night" });
    render(<EventCard event={event} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("does not render category badge when category is null", () => {
    const event = makeEvent({ category: null });
    render(<EventCard event={event} />);
    // Should not find any badge-like span with category text
    expect(screen.queryByText("⛪ Church Service")).not.toBeInTheDocument();
  });
});
