import type { Event, Profile, RSVP, Comment, Review, Place, Category } from "@/types/db";

export const TEST_USER_ID = "user-111-222-333";
export const TEST_VENDOR_ID = "vendor-444-555-666";
export const TEST_EVENT_ID = "event-aaa-bbb-ccc";
export const TEST_PLACE_ID = "place-ddd-eee-fff";

export function makeProfile(overrides?: Partial<Profile>): Profile {
  return {
    id: TEST_USER_ID,
    email: "testuser@example.com",
    role: "individual",
    full_name: "Test User",
    avatar_url: null,
    created_at: "2025-01-01T00:00:00Z",
    onboarding_completed: false,
    notification_email: null,
    home_latitude: null,
    home_longitude: null,
    notification_radius_km: 50,
    notification_digest: "instant",
    location_sharing: false,
    instagram_handle: null,
    facebook_url: null,
    tiktok_handle: null,
    ...overrides,
  };
}

export function makeEvent(overrides?: Partial<Event>): Event {
  return {
    id: TEST_EVENT_ID,
    title: "Sunday Service",
    description: "Weekly gathering for prayer and worship",
    date: "2026-04-12T09:00:00Z",
    end_time: null,
    location: "Grace Church, Durban",
    category: "church",
    image_url: null,
    website_url: null,
    contact_email: null,
    contact_phone: null,
    max_attendees: null,
    status: "published",
    visibility: "public",
    attendees_visible: "authenticated",
    latitude: -29.8587,
    longitude: 31.0218,
    marker_type: "category",
    marker_icon: null,
    marker_color: null,
    marker_image_url: null,
    category_id: null,
    created_by: TEST_VENDOR_ID,
    created_at: "2025-06-01T00:00:00Z",
    ...overrides,
  };
}

export function makeRSVP(overrides?: Partial<RSVP>): RSVP {
  return {
    id: "rsvp-111",
    user_id: TEST_USER_ID,
    event_id: TEST_EVENT_ID,
    status: "attending",
    created_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

export function makeComment(overrides?: Partial<Comment>): Comment {
  return {
    id: "comment-111",
    event_id: TEST_EVENT_ID,
    user_id: TEST_USER_ID,
    body: "Looking forward to this!",
    created_at: "2026-04-01T12:00:00Z",
    profiles: { full_name: "Test User" },
    ...overrides,
  };
}

export function makeCategory(overrides?: Partial<Category>): Category {
  return {
    id: "cat-111",
    name: "Church",
    slug: "church",
    emoji: "⛪",
    color: "#6366f1",
    applies_to: "both",
    sort_order: 1,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makePlace(overrides?: Partial<Place>): Place {
  return {
    id: TEST_PLACE_ID,
    name: "Grace Community Church",
    description: "A welcoming church in central Durban",
    address: "123 Main St, Durban",
    category_id: "cat-111",
    custom_category: null,
    image_url: null,
    phone: "+27 31 000 0000",
    website: "https://grace.co.za",
    latitude: -29.8587,
    longitude: 31.0218,
    created_by: TEST_VENDOR_ID,
    verified: true,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeReview(overrides?: Partial<Review>): Review {
  return {
    id: "review-111",
    place_id: TEST_PLACE_ID,
    event_id: null,
    user_id: TEST_USER_ID,
    rating: 4,
    body: "Great community!",
    still_exists: true,
    created_at: "2026-03-15T00:00:00Z",
    profiles: { full_name: "Test User" },
    ...overrides,
  };
}
