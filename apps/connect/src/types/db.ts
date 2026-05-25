import type { SearchProfile } from "@/lib/searchProfile";

export type EventCategory =
  | "worship-prayer"
  | "church-services"
  | "outreach-missions"
  | "markets-expos"
  | "sport-recreation"
  | "arts-culture"
  | "social-gatherings"
  | "community-upliftment"
  | "education-equipping"
  | "marriage-family"
  | "mens-community"
  | "womens-community"
  | "youth-students"
  | "kids"
  | "care-recovery"
  | "members-only"
  | "conferences-summits";

export type PlaceCategory =
  | "churches-ministries"
  | "hospitality-cafes"
  | "recreation-sport"
  | "media-broadcasting"
  | "retail-shopping"
  | "health-wellness"
  | "education-training"
  | "arts-creative"
  | "christian-businesses"
  | "safe-spaces";

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
  /** True when this event was created by a Citizen (not an approved
   *  Contributor).  UI renders a "Community-organised" chip so viewers
   *  can distinguish editorially-curated events from community ones.
   *  Added in migration 036; force-tagged by a DB trigger in 037. */
  community_contributor?: boolean;
  /** Structured discovery tags used by the AI search engine (Phase 1). */
  search_profile?: SearchProfile | null;
  /** Optional embedded creator profile — populated by `select("*, creator:profiles!events_created_by_fkey(avatar_url, role, contributor_status)")`.
   *  Used by the map to auto-render an organiser's avatar as the marker when
   *  `marker_type === "category"`, and by the verified-contributor crown. */
  creator?: {
    avatar_url: string | null;
    role: UserRole;
    contributor_status?: string | null;
  } | null;
};

export type MediaKind = "image" | "video";

export type EventMediaKind = MediaKind;

export type EntityMedia = {
  id: string;
  url: string;
  kind: MediaKind;
  thumbnail_url: string | null;
  title: string | null;
  sort_order: number;
  uploaded_by: string;
  created_at: string;
};

export type EventMedia = EntityMedia & {
  event_id: string;
};

export type PlaceMedia = EntityMedia & {
  place_id: string;
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

/**
 * Canonical user role.
 *
 * Migration 033 collapsed the previous seven-way enum
 * (individual / ministry / organization / business / vendor / client / admin)
 * into a clean three-way model that mirrors the platform's vocabulary:
 *
 *   - "citizen"     — anyone who shows up to discover, RSVP, comment, follow
 *   - "contributor" — anyone who creates events, manages places, or hosts gatherings
 *   - "admin"       — operations / moderation
 *
 * The old "kind of contributor" (ministry / organization / business) is preserved
 * on the profile via {@link ContributorKind} so we don't lose affiliation data.
 */
export type UserRole = "citizen" | "contributor" | "admin";

/**
 * Sub-type of contributor.  Only meaningful when {@link UserRole} is "contributor";
 * always null for citizens and admins.  Used purely for display ("Contributor —
 * Ministry") and downstream personalisation; carries no extra permissions.
 */
export type ContributorKind = "ministry" | "organization" | "business";

/** Roles that can create & manage events / places.  Single source of truth. */
export const CONTRIBUTOR_ROLES: UserRole[] = ["contributor", "admin"];

/**
 * Legacy alias for {@link CONTRIBUTOR_ROLES}.  Existing call sites import
 * `ORGANISER_ROLES` from this module; we keep the alias to avoid a churn
 * commit that touches a dozen unrelated files.  New code should prefer
 * `CONTRIBUTOR_ROLES`.
 *
 * @deprecated Use {@link CONTRIBUTOR_ROLES} instead.
 */
export const ORGANISER_ROLES: UserRole[] = CONTRIBUTOR_ROLES;

/** Human-readable label for each role. */
export const ROLE_LABELS: Record<UserRole, string> = {
  citizen: "Citizen",
  contributor: "Contributor",
  admin: "Admin",
};

/** Human-readable label for each contributor sub-type. */
export const CONTRIBUTOR_KIND_LABELS: Record<ContributorKind, string> = {
  ministry: "Ministry",
  organization: "Organization",
  business: "Business",
};

/**
 * Returns a human-readable role label, expanding contributors to include
 * their sub-type when available (e.g. "Contributor - Ministry").
 */
export function getRoleDisplayLabel(
  role: UserRole,
  contributorKind?: ContributorKind | null
): string {
  if (role === "contributor" && contributorKind) {
    return `Contributor - ${CONTRIBUTOR_KIND_LABELS[contributorKind]}`;
  }
  return ROLE_LABELS[role] ?? "Citizen";
}

export type Profile = {
  id: string;
  email: string;
  role: UserRole;
  /** Sub-type of contributor; null for citizens, admins, and contributors who
   *  never picked one.  See {@link ContributorKind}. */
  contributor_kind: ContributorKind | null;
  full_name: string;
  avatar_url: string | null;
  notification_email: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  notification_radius_km: number;
  notification_digest: NotificationDigest;
  /** Per-type notification toggles. Missing keys default to true. Added in
   *  migration 049. Cancellation notices are not gated — always delivered. */
  notification_prefs?: NotificationPrefs;
  location_sharing: boolean;
  instagram_handle: string | null;
  facebook_url: string | null;
  tiktok_handle: string | null;
  /** Contributor application status — "not_applied" for citizens who haven't
   *  applied; flipped to "pending" on submission; set by admin RPCs to
   *  "approved" or "rejected".  Added in migration 036. */
  contributor_status?: "not_applied" | "pending" | "approved" | "rejected";
  /** Public Contributor profile fields.  All NULL for citizens.  Added in
   *  migration 036.  `gallery_urls` is a JSONB array of image URLs. */
  bio?: string | null;
  website_url?: string | null;
  physical_address?: string | null;
  physical_latitude?: number | null;
  physical_longitude?: number | null;
  logo_url?: string | null;
  gallery_urls?: string[];
  youtube_url?: string | null;
  contributor_slug?: string | null;
  needs_re_review?: boolean;
  community_contributor_score?: number;
  /** Demographic columns (migration 035).  All NULL by default — populated
   *  opportunistically by Easter-egg micro-prompts.  Never required. */
  gender: string | null;
  age_range: string | null;
  relationship_status: string | null;
  stage_of_life: string | null;
  energy_level: string | null;
  /** Per-user preference bag (migrations 034 + 035).  Structure below is
   *  enforced client-side; the DB just stores `jsonb`. */
  preferences: Preferences;
  /** Bumped to `now()` by a DB trigger whenever `role` changes (Batch E,
   *  migration 057). Middleware invalidates sessions whose `iat` is older
   *  than this, forcing re-login so JWT + RLS pick up the new role. */
  force_reauth_at?: string | null;
  /** Set to TRUE on citizen→contributor promotion. Cleared by
   *  `/api/contributor/setup`. Middleware routes contributors with this
   *  flag to `/contributor/setup` before any other protected page. */
  bio_setup_required?: boolean;
  /** Citizens Wear style preferences bag (migration 072).  Free-form jsonb;
   *  schema is enforced client-side by `apps/wear`.  Empty `{}` for users
   *  who have not used Wear. */
  wear_style_preferences?: Record<string, unknown>;
  /** Wear wardrobe visibility (migration 072).  Default `'private'`. */
  wear_wardrobe_visibility?: "public" | "private" | "friends";
  /** Citizens Learn enrolled course/listing ids (migration 072).
   *  Empty array for users who have not enrolled in anything. */
  learn_enrolled_listings?: string[];
  /** Connect-specific home province for province-level filtering and
   *  badges (migration 072).  FK to `public.provinces(name)` (migration 079). */
  connect_home_province?: string | null;
  /** FEAT-06 billing tier (migration 081). `'individual'` = R30/event,
   *  `'medium'` = R150/event, `'large'` = R250/event. Default `'individual'`.
   *  Set by admin during contributor approval. */
  billing_tier?: BillingTier;
  /** Optional explicit start of the contributor's 3-month free trial
   *  (migration 081). When null the UI falls back to `created_at`. */
  billing_trial_started_at?: string | null;
  created_at: string;
};

/** FEAT-06 — contributor billing tier (migration 081). */
export type BillingTier = "individual" | "medium" | "large";

export const BILLING_TIER_LABELS: Record<BillingTier, string> = {
  individual: "Individual / Small brand",
  medium: "Medium organisation (50–500)",
  large: "Large ministry / Corporate (500+)",
};

export const BILLING_TIER_EVENT_RATE_ZAR: Record<BillingTier, number> = {
  individual: 30,
  medium: 150,
  large: 250,
};

/** Row in `public.contributor_billing` (migration 081). Monthly tally of
 *  billable activity per contributor, written by DB triggers. */
export type ContributorBilling = {
  profile_id: string;
  /** YYYY-MM, e.g. `"2026-05"`. */
  month: string;
  event_count: number;
  place_count: number;
  /** ZAR. Computed by trigger from `billing_tier × event_count`. */
  calculated_total: number;
  updated_at: string;
};

/**
 * Row in `public.content_labels` (migration 073).  Labels are written by
 * admins or by the `apply_event_content_labels` trigger; they are read by
 * every client (RLS allows SELECT for anon).  Labels are short, lowercase
 * tags such as `'market'` or `'education'` used by filter chips and search.
 */
export type ContentLabel = {
  id: string;
  entity_type: "event" | "place" | "profile";
  entity_id: string;
  label: string;
  created_at: string;
};

/**
 * Shape of `profiles.preferences`.  Kept flexible — every slice is optional
 * so partial writes are safe.  See {@link PreferenceTag} for the tag-entry
 * contract.  New keys can be added without a migration.
 */
export type Preferences = {
  /** Legacy Would-You-Rather answers (migration 034). */
  wyr?: Record<string, "left" | "right">;
  /** Date-stamped Easter-egg answers keyed by tag slug (migration 035). */
  tags?: Record<string, PreferenceTag>;
  /** Server-cached per-category interest percentages (0..100).  Recomputed
   *  on every `/api/preferences` write. */
  percentages?: Partial<Record<EventCategory | PlaceCategory, number>>;
  /** Unlocked when the user opts into the leadership Easter egg. */
  leadership_interest?: boolean | null;
  /** Timestamp of the last time the Rainbow "?" long-form sheet was shown. */
  last_longform_asked_at?: string | null;
  /** Any other forward-compatible keys clients may start writing. */
  [key: string]: unknown;
};

/**
 * A single Easter-egg answer stored under `preferences.tags[tagKey]`.
 * `expires_at` is advisory — when in the past, the orchestrator treats the
 * tag as "needs answer" and may re-ask.  `null` means the answer never
 * expires (e.g. gender, a lifetime tag).
 */
export type PreferenceTag = {
  value: unknown;
  answered_at: string;
  expires_at: string | null;
};

export type Comment = {
  id: string;
  event_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: { full_name: string };
};

/**
 * Additional physical venues for a Contributor profile (migration 060).
 * The primary venue still lives on `profiles.physical_address` + lat/lng;
 * this table captures zero-or-more secondary venues (e.g. U-Turn
 * operates a head-office shop in Roeland Street AND a Life-Change Centre
 * in Claremont). Public-read via RLS.
 */
export type ContributorLocation = {
  id: string;
  profile_id: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  sort_order: number;
  created_at: string;
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
  /** Structured discovery tags used by the AI search engine (Phase 1). */
  search_profile?: SearchProfile | null;
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
  | "new_message"
  | "review_prompt"
  | "friend_convince"
  | "friend_attending"
  // Admin / contributor pipeline (DB CHECK in migrations 069 + 085).
  | "admin_elevation_request"
  | "contributor_approved"
  | "contributor_rejected";

/**
 * FEAT-04 Convince row — one per (from, to, event); permanent UNIQUE.
 * RLS lets sender and target read; only mutual friends can insert when
 * the target is currently considering the event. See migration 069.
 */
export type Convince = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  event_id: string;
  created_at: string;
};

/**
 * FEAT-04 Friends-considering aggregate: one event + the list of mutual
 * friends who are currently considering it. Powers the "Friends" tab of
 * the Considerations section in BurgerMenu.
 */
export type FriendConsidering = {
  event: Event;
  friends: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  }[];
};

/**
 * Reusable event tag (migration 056). Tags are a flat namespace distinct
 * from the curated {@link EventCategory}: any authenticated user can
 * propose one. `is_official` marks admin-seeded tags; `is_hidden` is a
 * moderation flag that suppresses the tag from public surfaces without
 * deleting existing assignment rows.
 */
export type EventTag = {
  id: string;
  slug: string;
  label: string;
  is_official: boolean;
  is_hidden: boolean;
  usage_count: number;
  created_by: string | null;
  created_at: string;
};

export type EventTagAssignment = {
  event_id: string;
  tag_id: string;
  created_by: string | null;
  created_at: string;
};

/** Max tags allowed per event (DB-enforced by trigger in migration 056). */
export const EVENT_TAG_LIMIT = 5;

export type EventUpdate = {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  is_system: boolean;
  created_at: string;
};

export type NotificationDigest = "instant" | "daily" | "off";

/**
 * Per-type notification toggles stored in `profiles.notification_prefs`
 * (jsonb). All keys are optional — missing keys default to `true` (opt-out
 * model). See migration 049. Cancellation notices are never gated.
 */
export type NotificationPrefKey =
  | "friends_activity"
  | "event_reminders"
  | "contributor_updates"
  | "announcements"
  | "weekly_digest";

export type NotificationPrefs = Partial<Record<NotificationPrefKey, boolean>>;

export const NOTIFICATION_PREF_DEFAULTS: Required<NotificationPrefs> = {
  friends_activity: true,
  event_reminders: true,
  contributor_updates: true,
  announcements: true,
  weekly_digest: true,
};

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
