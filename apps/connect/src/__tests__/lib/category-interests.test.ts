import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EventCategory } from "@/types/db";

/**
 * Regression guard for the Edge-Function side of the category contract.
 *
 * `CATEGORY_INTEREST_MAP` lives in `supabase/functions/_shared/category-interests.ts`
 * which is intentionally outside the main tsconfig include (Deno runtime, not
 * Next.js). It is typed `Record<string, string[]>` so TypeScript cannot enforce
 * slug coverage at compile time. This suite reads the source file at runtime
 * and asserts every one of the 17 canonical slugs appears as a key, so
 * `notify-interested-users` and `send-daily-digest` cannot silently skip
 * notifications for a new slug.
 */
describe("CATEGORY_INTEREST_MAP (Edge Function shared)", () => {
  const EVENT_REFERENCE: EventCategory[] = [
    "worship-prayer",
    "church-services",
    "outreach-missions",
    "markets-expos",
    "sport-recreation",
    "arts-culture",
    "social-gatherings",
    "community-upliftment",
    "education-equipping",
    "marriage-family",
    "mens-community",
    "womens-community",
    "youth-students",
    "kids",
    "care-recovery",
    "members-only",
    "conferences-summits",
  ];

  // supabase/ lives at the monorepo root (hoisted in ecosystem Step 5), two
  // levels above this app — vitest always runs with cwd = apps/connect.
  // (import.meta.url is not a file: URL under the jsdom environment.)
  const source = readFileSync(
    resolve(
      process.cwd(),
      "../../supabase/functions/_shared/category-interests.ts"
    ),
    "utf-8"
  );

  // Strip block + line comments so legacy / aspirational slug names mentioned
  // in commentary cannot accidentally satisfy the regex below.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  /** Match top-level `"slug-name":` or `slug-name:` keys (no quotes for `kids`). */
  const KEY_LINE_RE = /^\s*("?[a-z][a-z0-9-]*"?)\s*:\s*\[/gm;
  const declaredKeys: string[] = [];
  for (const m of stripped.matchAll(KEY_LINE_RE)) {
    declaredKeys.push(m[1].replace(/"/g, ""));
  }

  it("has an entry for every one of the 17 canonical event slugs", () => {
    for (const slug of EVENT_REFERENCE) {
      expect(declaredKeys, `missing slug: ${slug}`).toContain(slug);
    }
  });

  it("has no extra slugs outside the canonical 17", () => {
    const reference = new Set<string>(EVENT_REFERENCE);
    for (const slug of declaredKeys) {
      expect(reference.has(slug), `unexpected slug: ${slug}`).toBe(true);
    }
  });

  it("declares exactly 17 top-level keys", () => {
    expect(declaredKeys.length).toBe(17);
  });

  it("export name CATEGORY_INTEREST_MAP is present in the source", () => {
    expect(source).toContain("CATEGORY_INTEREST_MAP");
  });
});
