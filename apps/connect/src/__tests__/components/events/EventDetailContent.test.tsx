import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import EventDetailContent from "@/components/events/EventDetailContent";
import { makeEvent } from "../../helpers/fixtures";

// Mock child components to isolate DetailContent tests
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = (p: { latitude: number; longitude: number }) => (
      <div data-testid="mini-map">
        {p.latitude},{p.longitude}
      </div>
    );
    Stub.displayName = "MiniMapStub";
    return Stub;
  },
}));

vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} data-testid="cover-image" />
  ),
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

vi.mock("@/components/events/RSVPButton", () => ({
  default: ({ eventId }: { eventId: string }) => (
    <button data-testid="rsvp-btn">{eventId}</button>
  ),
}));

vi.mock("@/components/events/CommentSection", () => ({
  default: () => <div data-testid="comments">Comments</div>,
}));

vi.mock("@/components/reviews/ReviewList", () => ({
  default: () => <div data-testid="reviews">Reviews</div>,
}));

vi.mock("@/components/ui/SocialShareButtons", () => ({
  default: () => <div data-testid="social-share-btns">Share</div>,
}));

vi.mock("@/components/reviews/InlineEventRating", () => ({
  default: () => <div data-testid="inline-rating">Rating</div>,
}));

vi.mock("@/components/events/LiveTrackingPrompt", () => ({
  default: () => <div data-testid="live-tracking">Tracking</div>,
}));

vi.mock("@/components/events/LocationSharingToggle", () => ({
  default: () => <div data-testid="location-sharing">Location</div>,
}));

vi.mock("@/components/messaging/MessageButton", () => ({
  default: () => <button data-testid="message-btn">Message</button>,
}));

vi.mock("@/components/events/WhoIsAttending", () => ({
  default: () => <div data-testid="who-attending">Attendees</div>,
}));

const baseEvent = makeEvent({
  id: "evt-detail-1",
  title: "Worship Night",
  description: "A night of praise",
  date: "2026-05-10T18:00:00Z",
  location: "City Hall",
  category: "church",
  image_url: "https://example.com/worship.jpg",
  latitude: -29.85,
  longitude: 31.02,
  created_by: "owner-id-123",
});

const ownerUser = { id: "owner-id-123" } as import("@supabase/supabase-js").User;
const otherUser = { id: "other-user-456" } as import("@supabase/supabase-js").User;

describe("EventDetailContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders event title", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={12}
        user={otherUser}
        hasRsvped={false}
      />
    );
    expect(screen.getByRole("heading", { name: "Worship Night" })).toBeInTheDocument();
  });

  it("renders formatted date", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    // Date should include May 10, 2026 (formatted)
    expect(screen.getByText(/may/i)).toBeInTheDocument();
  });

  it("renders location", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.getByText("City Hall")).toBeInTheDocument();
  });

  it("renders attending count", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={42}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.getByText("42 attending")).toBeInTheDocument();
  });

  it("renders category badge for categorized events", () => {
    const socialEvent = makeEvent({ ...baseEvent, category: "social-fun" });
    render(
      <EventDetailContent
        event={socialEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.getByText("Social Fun")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.getByText("A night of praise")).toBeInTheDocument();
  });

  it("renders cover image when image_url provided", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    const img = screen.getByTestId("cover-image");
    expect(img).toHaveAttribute("src", "https://example.com/worship.jpg");
  });

  it("does not render cover image when image_url is null", () => {
    const noImgEvent = makeEvent({ ...baseEvent, image_url: null });
    render(
      <EventDetailContent
        event={noImgEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.queryByTestId("cover-image")).not.toBeInTheDocument();
  });

  it("renders MiniMap when coordinates exist", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.getByTestId("mini-map")).toBeInTheDocument();
  });

  it("does not render MiniMap when coordinates are null", () => {
    const noCoordEvent = makeEvent({
      ...baseEvent,
      latitude: null,
      longitude: null,
    });
    render(
      <EventDetailContent
        event={noCoordEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.queryByTestId("mini-map")).not.toBeInTheDocument();
  });

  it("shows RSVP button for logged-in user", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={otherUser}
        hasRsvped={false}
      />
    );
    expect(screen.getByTestId("rsvp-btn")).toBeInTheDocument();
  });

  it("shows 'Log in to RSVP' link for unauthenticated user", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    const link = screen.getByText("Log in to RSVP");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/login");
  });

  it("shows Edit button for event owner", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={ownerUser}
        hasRsvped={false}
      />
    );
    const editLink = screen.getByText(/edit event/i);
    expect(editLink.closest("a")).toHaveAttribute(
      "href",
      "/events/evt-detail-1/edit"
    );
  });

  it("hides Edit button for non-owner", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={otherUser}
        hasRsvped={false}
      />
    );
    expect(screen.queryByText(/edit event/i)).not.toBeInTheDocument();
  });

  it("renders Back to Events link", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    const back = screen.getByText(/back to events/i);
    expect(back.closest("a")).toHaveAttribute("href", "/events");
  });

  it("renders CommentSection", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.getByTestId("comments")).toBeInTheDocument();
  });

  it("renders SocialShareButtons", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.getByTestId("social-share-btns")).toBeInTheDocument();
  });
});
