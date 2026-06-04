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

// 30 days in the future so RSVP-availability branches render without flake.
// Tests that need a past/in-session event override `date` explicitly below.
const baseEvent = makeEvent({
  id: "evt-detail-1",
  title: "Worship Night",
  description: "A night of praise",
  date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  location: "City Hall",
  category: "church-services",
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
    // Date should be formatted as the long month name of baseEvent.date.
    // We derive the expected month from the fixture so the assertion stays
    // stable when the fixture's relative date crosses month boundaries.
    const expectedMonth = new Date(baseEvent.date).toLocaleString("en-US", {
      month: "long",
    });
    expect(
      screen.getByText(new RegExp(expectedMonth, "i"))
    ).toBeInTheDocument();
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
    const socialEvent = makeEvent({ ...baseEvent, category: "social-gatherings" });
    render(
      <EventDetailContent
        event={socialEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.getByText("Social Gatherings")).toBeInTheDocument();
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
    const editLink = screen.getByRole("link", { name: /^edit$/i });
    expect(editLink).toHaveAttribute("href", "/events/evt-detail-1/edit");
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

  it("no longer renders an inline back link (handled by PageHeader at page level)", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.queryByText(/back to events/i)).not.toBeInTheDocument();
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
    expect(screen.queryByTestId("reviews")).not.toBeInTheDocument();
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

  // ── Organiser link + rating-gate (Batch N) ─────────────────────────
  it("renders 'Organised by' link to /c/<slug> for approved contributor", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
        organiser={{
          id: "org-1",
          full_name: "Every Nation Mooikloof",
          role: "contributor",
          contributor_status: "approved",
          contributor_slug: "every-nation-mooikloof",
          logo_url: null,
          avatar_url: null,
        }}
      />
    );
    const link = screen.getByRole("link", { name: "Every Nation Mooikloof" });
    expect(link).toHaveAttribute("href", "/c/every-nation-mooikloof");
  });

  it("falls back to /profile/<id> when organiser has no slug", () => {
    render(
      <EventDetailContent
        event={baseEvent}
        count={0}
        user={null}
        hasRsvped={false}
        organiser={{
          id: "uid-123",
          full_name: "Jane Citizen",
          role: "citizen",
          contributor_status: null,
          contributor_slug: null,
          logo_url: null,
          avatar_url: null,
        }}
      />
    );
    expect(
      screen.getByRole("link", { name: "Jane Citizen" }),
    ).toHaveAttribute("href", "/profile/uid-123");
  });

  it("hides the inline rating widget for upcoming events", () => {
    const upcoming = {
      ...baseEvent,
      date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      end_time: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 2 * 3600 * 1000).toISOString(),
    };
    render(
      <EventDetailContent
        event={upcoming}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.queryByTestId("inline-rating")).not.toBeInTheDocument();
  });

  it("shows the inline rating widget once the event has started", () => {
    const started = {
      ...baseEvent,
      date: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
    render(
      <EventDetailContent
        event={started}
        count={0}
        user={null}
        hasRsvped={false}
      />
    );
    expect(screen.getByTestId("inline-rating")).toBeInTheDocument();
  });
});
