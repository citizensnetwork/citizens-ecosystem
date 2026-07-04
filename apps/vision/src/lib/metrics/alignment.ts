// Citizens Vision — Auto-Tagging & Alignment Engine
// Keyword matching + category overlap for goal → activity inference

import type { Goal, Activity } from "@/types/db";

interface InferredLink {
  activity_id: string;
  confidence: number;
  reasons: string[];
}

/** Tokenise text: lowercase, strip punctuation, deduplicate */
function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

/** Compute Jaccard-like keyword overlap score between two token sets */
function keywordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  return intersection / Math.min(a.size, b.size);
}

/** Stop words to ignore during matching */
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "has", "his", "how", "its", "may",
  "new", "now", "old", "see", "way", "who", "did", "get", "let", "say",
  "she", "too", "use", "with", "this", "that", "from", "they", "been",
  "have", "many", "some", "them", "than", "will", "each", "make",
]);

/** Remove stop words from a token set */
function removeStopWords(tokens: Set<string>): Set<string> {
  const filtered = new Set<string>();
  for (const token of tokens) {
    if (!STOP_WORDS.has(token)) filtered.add(token);
  }
  return filtered;
}

/**
 * Infer potential goal → activity links based on:
 * 1. Keyword overlap between goal description/title and activity title/description
 * 2. Activity type relevance (configurable per goal via tags)
 *
 * Returns activities with confidence scores >= threshold.
 */
export function inferGoalActivityLinks(
  goal: Pick<Goal, "id" | "title" | "description">,
  activities: Pick<Activity, "id" | "title" | "description" | "type">[],
  options: { threshold?: number; maxResults?: number } = {}
): InferredLink[] {
  const { threshold = 0.3, maxResults = 50 } = options;

  const goalText = `${goal.title} ${goal.description ?? ""}`;
  const goalTokens = removeStopWords(tokenise(goalText));

  if (goalTokens.size === 0) return [];

  const results: InferredLink[] = [];

  for (const activity of activities) {
    const reasons: string[] = [];
    let confidence = 0;

    // 1. Title keyword overlap (weighted higher)
    const titleTokens = removeStopWords(tokenise(activity.title));
    const titleOverlap = keywordOverlap(goalTokens, titleTokens);
    if (titleOverlap > 0) {
      confidence += titleOverlap * 0.6;
      reasons.push(`Title keyword match (${(titleOverlap * 100).toFixed(0)}%)`);
    }

    // 2. Description keyword overlap
    if (activity.description) {
      const descTokens = removeStopWords(tokenise(activity.description));
      const descOverlap = keywordOverlap(goalTokens, descTokens);
      if (descOverlap > 0) {
        confidence += descOverlap * 0.4;
        reasons.push(`Description keyword match (${(descOverlap * 100).toFixed(0)}%)`);
      }
    }

    // Cap at 0.95 for inferred links (never 1.0 — that's for explicit)
    confidence = Math.min(Math.round(confidence * 100) / 100, 0.95);

    if (confidence >= threshold) {
      results.push({
        activity_id: activity.id,
        confidence,
        reasons,
      });
    }
  }

  // Sort by confidence descending, limit results
  return results
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxResults);
}

/**
 * Get alignment colour based on score thresholds
 */
export function getAlignmentColour(score: number): string {
  if (score < 30) return "#ef4444";
  if (score < 70) return "#f5a623";
  return "#6bcf7f";
}

/**
 * Get alignment label based on score
 */
export function getAlignmentLabel(score: number): string {
  if (score < 30) return "Low";
  if (score < 70) return "Moderate";
  return "Strong";
}
