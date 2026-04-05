export type EventCategory =
  | "church-service"
  | "youth"
  | "community-outreach"
  | "worship"
  | "bible-study"
  | "prayer"
  | "social"
  | "other";

export type Event = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  category: EventCategory | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  created_by: string;
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
