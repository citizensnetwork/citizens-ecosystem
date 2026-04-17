export type EventCategory =
  | "entertainment"
  | "sport-fun"
  | "social-fun"
  | "community-upliftment"
  | "education"
  | "church"
  | "missional"
  | "marriage-and-couples"
  | "mens"
  | "womens"
  | "kids"
  | "recovery"
  | "equip"
  | "weekend"
  | "members-only";

export type PlaceCategory =
  | "church"
  | "relax"
  | "exercise"
  | "media"
  | "shopping"
  | "health"
  | "education"
  | "arts";

export type EventStatus = "draft" | "published" | "cancelled";

export type EventVisibility = "public" | "private";

export type AttendeesVisibility = "public" | "authenticated" | "count_only";

export type MarkerType = "category" | "profile" | "icon" | "logo";

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
  visibility: EventVisibility;
  attendees_visible: AttendeesVisibility;
  latitude: number | null;
  longitude: number | null;
  marker_type: MarkerType;
  marker_icon: string | null;
  marker_color: string | null;
  marker_image_url: string | null;
  category_id: string | null;
  created_by: string;
  created_at: string;
};

export type EventMediaKind = "image" | "video";

export type EventMedia = {
  id: string;
  event_id: string;
  url: string;
  kind: EventMediaKind;
  thumbnail_url: string | null;
  title: string | null;
  sort_order: number;
  uploaded_by: string;
  created_at: string;
};

/** @deprecated — kept for backwards compatibility; prefer `EventMedia`. */
export type EventPhoto = EventMedia;

export type RsvpStatus = "attending" | "considering";

export type RSVP = {
  id: string;
  user_id: string;
  event_id: string;
  status: RsvpStatus;
  created_at: string;
};

export type ConsiderJoin = {
  id: string;
  rsvp_id: string;
  joiner_id: string;
  created_at: string;
  profiles?: { full_name: string; avatar_url: string | null };
};

export type UserRole =
  | "individual"
  | "ministry"
  | "organization"
  | "business"
  | "vendor"   // legacy — migrated to individual
  | "client"   // legacy — migrated to individual
  | "admin";

/** Roles that can create & manage places (\"Book at Place\" in EventForm). */
export const ORGANISER_ROLES: UserRole[] = ["ministry", "organization", "business", "admin"];

/** Human-readable label for each role. */
export const ROLE_LABELS: Record<UserRole, string> = {
  individual: "Community Citizen",
  ministry: "Ministry",
  organization: "Organization",
  business: "Business",
  vendor: "Community Citizen",  // legacy fallback
  client: "Community Citizen",  // legacy fallback
  admin: "Admin",
};

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
  location_sharing: boolean;
  instagram_handle: string | null;
  facebook_url: string | null;
  tiktok_handle: string | null;
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

export type PlaceFollow = {
  id: string;
  user_id: string;
  place_id: string;
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
  | "event_update"
  | "new_message";

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

// ── Phase 11: Direct Messaging ──────────────────

// ── Phase 12: Featured Listings ─────────────────

export type FeaturedListing = {
  id: string;
  event_id: string | null;
  place_id: string | null;
  cover_url: string;
  tagline: string;
  priority: number;
  starts_at: string;
  ends_at: string | null;
  created_by: string;
  created_at: string;
  events?: Event;
  places?: Place;
};

// ── Direct Messaging ────────────────────────────

// ── Phase 12C: Live Location ────────────────────

export type UserLocation = {
  id: string;
  user_id: string;
  event_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updated_at: string;
  profiles?: { full_name: string; avatar_url: string | null };
};

// ── Direct Messaging (continued) ────────────────

export type Conversation = {
  id: string;
  created_at: string;
  updated_at: string;
};

export type ConversationParticipant = {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
};

/** Conversation with preview info for inbox list */
export type ConversationPreview = {
  id: string;
  updated_at: string;
  other_user: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
  last_message: {
    body: string;
    sender_id: string | null;
    created_at: string;
  } | null;
  unread_count: number;
};

// ── Phase 17: Indemnity Forms ───────────────────

export type IndemnityTemplate = {
  id: string;
  slug: string;
  title: string;
  body: string;
  version: number;
  applies_to: "events" | "places" | "both";
  required: boolean;
  created_at: string;
  updated_at: string;
};

export type IndemnitySignature = {
  id: string;
  template_id: string;
  user_id: string;
  event_id: string | null;
  place_id: string | null;
  full_name: string;
  agreed_at: string;
  ip_address: string | null;
  template_version: number;
  created_at: string;
};
