export type EventCategory =
  | "church-service"
  | "youth"
  | "community-outreach"
  | "worship"
  | "bible-study"
  | "prayer"
  | "social"
  | "other";

export type EventStatus = "draft" | "published" | "cancelled";

export type AttendeesVisibility = "public" | "authenticated" | "count_only";

export type Event = {
  id: string;
  title: string;
  description: string;
  date: string;
  end_time: string | null;
  location: string;
  category: EventCategory | null;
  image_url: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  max_attendees: number | null;
  status: EventStatus;
  attendees_visible: AttendeesVisibility;
  latitude: number | null;
  longitude: number | null;
  created_by: string;
  created_at: string;
};

export type EventPhoto = {
  id: string;
  event_id: string;
  url: string;
  sort_order: number;
  uploaded_by: string;
  created_at: string;
};

export type RSVP = {
  id: string;
  user_id: string;
  event_id: string;
  created_at: string;
};

export type UserRole = "vendor" | "client" | "admin";

export type Profile = {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  avatar_url: string | null;
  onboarding_completed: boolean;
  notification_email: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  notification_radius_km: number;
  notification_digest: NotificationDigest;
  created_at: string;
};

export type Comment = {
  id: string;
  event_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: { full_name: string };
};

export type CategoryAppliesTo = "events" | "places" | "both";

export type Category = {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  color: string;
  applies_to: CategoryAppliesTo;
  sort_order: number;
  created_at: string;
};

export type Place = {
  id: string;
  name: string;
  description: string;
  address: string;
  category_id: string | null;
  custom_category: string | null;
  image_url: string | null;
  phone: string | null;
  website: string | null;
  latitude: number;
  longitude: number;
  created_by: string;
  verified: boolean;
  verification_flagged?: boolean;
  avg_rating?: number | null;
  reviews_count?: number;
  negative_signals?: number;
  created_at: string;
  categories?: Category;
};

export type Review = {
  id: string;
  place_id: string | null;
  event_id?: string | null;
  user_id: string;
  rating: number;
  body: string;
  still_exists: boolean;
  created_at: string;
  profiles?: { full_name: string };
};

export type Follow = {
  id: string;
  follower_id: string;
  followee_id: string;
  created_at: string;
};

export type InterestGroup = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
};

export type Interest = {
  id: string;
  group_id: string;
  slug: string;
  label: string;
  emoji: string;
  sort_order: number;
};

export type InterestGroupWithItems = InterestGroup & {
  interests: Interest[];
};

export type UserInterest = {
  user_id: string;
  interest_id: string;
  created_at: string;
};

export type EventInterestTag = {
  event_id: string;
  interest_id: string;
};

export type NotificationType =
  | "event_reminder"
  | "new_event_match"
  | "event_cancelled"
  | "new_follower"
  | "event_update";

export type NotificationDigest = "instant" | "daily" | "off";

export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  image_url: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export type PushTokenRecord = {
  id: string;
  user_id: string;
  token: string;
  platform: "ios" | "android" | "web";
  created_at: string;
};

/** Trending event — includes RSVP count. */
export type TrendingEvent = Event & { rsvp_count: number };

/** Favourite org — a followed vendor with their upcoming events. */
export type FavouriteOrg = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  upcoming_events: Event[];
};

/** Friend with events they're attending. */
export type FriendAttending = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  attending_events: Event[];
};
