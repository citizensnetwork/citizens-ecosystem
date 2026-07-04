/**
 * Rotating "Would You Rather" question pool.
 *
 * Used by the Easter-egg orchestrator as the primary personalization source
 * for new accounts.  Each question records under `preferences.wyr[qid]` as
 * "left" | "right" and is consumed by the percentage engine.
 *
 * Design notes:
 *   - `id` is stable persistence key — never rename an existing id; instead
 *     retire it and add a new one so historical answers keep their meaning.
 *   - Labels stay parallel in length and tone so neither side feels like the
 *     "default" choice.
 *   - Each question is loosely mapped to one or more category slugs; the
 *     percentage engine reads these to convert answers into category weight.
 */

import type { EventCategory, PlaceCategory } from "@/types/db";

export type WyrSide = "left" | "right";

export type WyrOption = {
  label: string;
  emoji?: string;
  /** Categories this side weights toward (read by the percentage engine). */
  categories?: (EventCategory | PlaceCategory)[];
};

export type WyrQuestion = {
  id: string;
  left: WyrOption;
  right: WyrOption;
};

/**
 * Pool of questions.  Sample N per user per 30-day window via
 * {@link sampleWyrBatch} — different users see different Q's, which keeps
 * the "Easter egg" vibe from feeling scripted.
 */
export const WYR_POOL: WyrQuestion[] = [
  {
    id: "crowd_size",
    left: { label: "Big crowds", emoji: "🎉", categories: ["arts-culture", "social-gatherings"] },
    right: { label: "Small groups", emoji: "🫶", categories: ["education-equipping"] },
  },
  {
    id: "planning",
    left: { label: "Plan ahead", emoji: "🗓️", categories: ["education-equipping"] },
    right: { label: "Spontaneous", emoji: "✨", categories: ["social-gatherings", "arts-culture"] },
  },
  {
    id: "setting",
    left: { label: "Outdoor adventures", emoji: "🌿", categories: ["sport-recreation", "conferences-summits"] },
    right: { label: "Cozy gatherings", emoji: "🛋️", categories: ["social-gatherings"] },
  },
  {
    id: "worship_vibe",
    left: { label: "Loud worship", emoji: "🎤", categories: ["church-services"] },
    right: { label: "Quiet reflection", emoji: "🕯️", categories: ["church-services", "education-equipping"] },
  },
  {
    id: "depth",
    left: { label: "Deep one-on-ones", emoji: "☕", categories: ["education-equipping"] },
    right: { label: "Group conversations", emoji: "💬", categories: ["social-gatherings"] },
  },
  {
    id: "vibe",
    left: { label: "Action & adventure", emoji: "⛰️", categories: ["sport-recreation", "conferences-summits"] },
    right: { label: "Creative & nurturing", emoji: "🎨", categories: ["arts-culture", "care-recovery"] },
  },
  {
    id: "time_of_day",
    left: { label: "Mornings", emoji: "🌅" },
    right: { label: "Evenings", emoji: "🌙" },
  },
  {
    id: "social_familiarity",
    left: { label: "New faces", emoji: "👋", categories: ["outreach-missions", "community-upliftment"] },
    right: { label: "Familiar friends", emoji: "🤝", categories: ["social-gatherings"] },
  },
  {
    id: "serve_or_learn",
    left: { label: "Serve others", emoji: "🤲", categories: ["outreach-missions", "community-upliftment"] },
    right: { label: "Learn deeper", emoji: "📖", categories: ["education-equipping"] },
  },
  {
    id: "kids_vibe",
    left: { label: "Family-friendly", emoji: "👨‍👩‍👧", categories: ["kids", "marriage-family"] },
    right: { label: "Adults-only space", emoji: "🍷", categories: ["mens-community", "womens-community"] },
  },
  {
    id: "energy_preference",
    left: { label: "High-energy", emoji: "⚡", categories: ["sport-recreation", "arts-culture"] },
    right: { label: "Calm & restorative", emoji: "🌿", categories: ["care-recovery"] },
  },
  {
    id: "media_or_movement",
    left: { label: "Movies & media", emoji: "🎬", categories: ["arts-culture"] },
    right: { label: "Physical activity", emoji: "🏃", categories: ["sport-recreation"] },
  },
  {
    id: "weekend_rhythm",
    left: { label: "Packed weekends", emoji: "📅", categories: ["conferences-summits", "social-gatherings"] },
    right: { label: "Slow Sundays", emoji: "☁️", categories: ["church-services", "care-recovery"] },
  },
  {
    id: "healing_or_building",
    left: { label: "Healing & recovery", emoji: "🌱", categories: ["care-recovery"] },
    right: { label: "Building & creating", emoji: "🛠️", categories: ["education-equipping", "outreach-missions"] },
  },
  {
    id: "near_or_far",
    left: { label: "Close to home", emoji: "🏡" },
    right: { label: "New neighborhoods", emoji: "🗺️" },
  },
  {
    id: "coffee_or_meal",
    left: { label: "Coffee catch-up", emoji: "☕", categories: ["social-gatherings"] },
    right: { label: "Shared meal", emoji: "🍽️", categories: ["social-gatherings", "community-upliftment"] },
  },
  {
    id: "talk_or_walk",
    left: { label: "Sit & talk", emoji: "💬" },
    right: { label: "Walk & talk", emoji: "🚶", categories: ["sport-recreation"] },
  },
  {
    id: "structured_or_organic",
    left: { label: "Structured programmes", emoji: "📋", categories: ["education-equipping"] },
    right: { label: "Organic gatherings", emoji: "🌿", categories: ["social-gatherings"] },
  },
  {
    id: "give_or_grow",
    left: { label: "Give generously", emoji: "🎁", categories: ["outreach-missions", "community-upliftment"] },
    right: { label: "Grow personally", emoji: "🌱", categories: ["education-equipping"] },
  },
  {
    id: "lead_or_follow",
    left: { label: "Lead the room", emoji: "🎤" },
    right: { label: "Follow the flow", emoji: "🌊" },
  },
];

/**
 * Deterministic per-user sample of N unanswered questions.  Uses a simple
 * FNV-1a hash of `userId + seed` as a tie-breaker so two users see different
 * pools but the same user sees the same pool across sessions.
 */
export function sampleWyrBatch(input: {
  userId: string;
  answered: Record<string, WyrSide>;
  size: number;
  seed?: string;
}): WyrQuestion[] {
  const { userId, answered, size, seed = "" } = input;
  const unanswered = WYR_POOL.filter((q) => answered[q.id] === undefined);
  const scored = unanswered
    .map((q) => ({ q, hash: hashStr(userId + "|" + seed + "|" + q.id) }))
    .sort((a, b) => a.hash - b.hash);
  return scored.slice(0, size).map((s) => s.q);
}

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}
