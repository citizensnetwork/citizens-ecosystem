import { describe, it, expect } from "vitest";
import {
  makeProfile,
  makeEvent,
  makeRSVP,
  makeComment,
  makeCategory,
  makePlace,
  makeReview,
  TEST_USER_ID,
  TEST_VENDOR_ID,
  TEST_EVENT_ID,
  TEST_PLACE_ID,
} from "../helpers/fixtures";

describe("Test fixtures", () => {
  it("creates valid Profile with defaults", () => {
    const profile = makeProfile();
    expect(profile.id).toBe(TEST_USER_ID);
    expect(profile.role).toBe("citizen");
    expect(profile.email).toContain("@");
  });

  it("allows overriding Profile fields", () => {
    const profile = makeProfile({ role: "contributor", contributor_kind: "ministry", full_name: "Jane Doe" });
    expect(profile.role).toBe("contributor");
    expect(profile.contributor_kind).toBe("ministry");
    expect(profile.full_name).toBe("Jane Doe");
  });

  it("creates valid Event with coordinates", () => {
    const event = makeEvent();
    expect(event.id).toBe(TEST_EVENT_ID);
    expect(event.latitude).toBe(-29.8587);
    expect(event.longitude).toBe(31.0218);
    expect(event.created_by).toBe(TEST_VENDOR_ID);
  });

  it("creates valid RSVP linking user to event", () => {
    const rsvp = makeRSVP();
    expect(rsvp.user_id).toBe(TEST_USER_ID);
    expect(rsvp.event_id).toBe(TEST_EVENT_ID);
  });

  it("creates valid Comment with profile join", () => {
    const comment = makeComment();
    expect(comment.event_id).toBe(TEST_EVENT_ID);
    expect(comment.profiles?.full_name).toBe("Test User");
  });

  it("creates valid Category", () => {
    const category = makeCategory();
    expect(category.slug).toBe("church");
    expect(category.emoji).toBe("⛪");
  });

  it("creates valid Place with coordinates", () => {
    const place = makePlace();
    expect(place.id).toBe(TEST_PLACE_ID);
    expect(place.verified).toBe(true);
    expect(place.latitude).toBe(-29.8587);
  });

  it("creates valid Review with rating", () => {
    const review = makeReview();
    expect(review.rating).toBe(4);
    expect(review.place_id).toBe(TEST_PLACE_ID);
    expect(review.still_exists).toBe(true);
  });

  it("allows overriding Review for event reviews", () => {
    const review = makeReview({ place_id: null, event_id: TEST_EVENT_ID });
    expect(review.place_id).toBeNull();
    expect(review.event_id).toBe(TEST_EVENT_ID);
  });
});
