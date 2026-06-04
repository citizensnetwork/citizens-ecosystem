// Involvement level — a COMPUTED PROXY for how active a contributor is in
// the Body, surfaced as a badge on their public profile (Figma "ContributorProfile").
//
// VISION / honesty note: the Figma mock carries a hand-set `involvementLevel`
// string. We do NOT fabricate or store a level — we derive it on render from
// real, already-public signals (followers, events hosted, places hosted, team
// size). The thresholds below are an intentionally simple, transparent
// heuristic; they only set a badge tier and never gate access or hide anyone.
// The smallest contributor still gets an honest "Seed" — a real, honoured part
// of the Body — and the tier rises naturally as genuine activity grows.
//
// If/when a real involvement-level backing store lands (see FIGMA_FULL_UI_PLAN
// Phase 6), this proxy can be swapped for the stored value without touching the
// UI, which only consumes the returned level + colour.

export type InvolvementLevel = "Seed" | "Shepherd" | "Pillar" | "Beacon";

/** Badge colours — match the Figma involvement palette. */
export const INVOLVEMENT_COLORS: Record<InvolvementLevel, string> = {
  Seed: "#2563EB",
  Shepherd: "#16A34A",
  Pillar: "#7C3AED",
  Beacon: "#C9A84C",
};

/** Short, human description of what each tier reflects (for tooltips/a11y). */
export const INVOLVEMENT_DESCRIPTIONS: Record<InvolvementLevel, string> = {
  Seed: "Getting started in the community",
  Shepherd: "Actively gathering and serving people",
  Pillar: "A established, well-followed contributor",
  Beacon: "A cornerstone contributor lighting the way",
};

export type InvolvementSignals = {
  /** Public follower count. */
  followers: number;
  /** Events hosted (upcoming + past, published). */
  events: number;
  /** Places hosted. */
  places: number;
  /** Active public team members. */
  teamSize: number;
};

/**
 * Weighted, saturating-free score → tier. Events and places (real Kingdom
 * activity) are weighted more heavily than raw follower counts so a small,
 * busy contributor isn't buried beneath a popular-but-idle one.
 */
export function involvementScore({
  followers,
  events,
  places,
  teamSize,
}: InvolvementSignals): number {
  return (
    Math.max(0, followers) +
    Math.max(0, events) * 5 +
    Math.max(0, places) * 5 +
    Math.max(0, teamSize) * 3
  );
}

export function computeInvolvementLevel(signals: InvolvementSignals): InvolvementLevel {
  const score = involvementScore(signals);
  if (score >= 250) return "Beacon";
  if (score >= 80) return "Pillar";
  if (score >= 20) return "Shepherd";
  return "Seed";
}
