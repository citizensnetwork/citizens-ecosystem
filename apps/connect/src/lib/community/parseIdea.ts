import type { EventCategory } from "@/types/db";
import { CATEGORY_LABELS } from "@/lib/categories";

const CAT_PREFIX_RE = /^\[cat:([^\]]+)\]\n\n([\s\S]*)$/;

export type ParsedIdea = {
  categoryId: EventCategory | null;
  description: string;
};

/**
 * Community idea bodies are stored as "[cat:category-id]\n\nUser description".
 * This extracts the category slug and the clean description for display.
 * Falls back gracefully — if no prefix, the full body is the description.
 */
export function parseIdeaBody(body: string): ParsedIdea {
  const match = CAT_PREFIX_RE.exec(body);
  if (!match) return { categoryId: null, description: body };
  const cat = match[1];
  if (!(cat in CATEGORY_LABELS)) return { categoryId: null, description: body };
  return { categoryId: cat as EventCategory, description: match[2] };
}
