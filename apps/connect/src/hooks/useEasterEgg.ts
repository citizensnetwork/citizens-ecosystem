"use client";

/**
 * useEasterEgg — read/record a single dated preference tag.
 *
 * Contract (see `/memories/session/plan.md` Phase C):
 *   - Reads `profiles.preferences.tags[tagKey]` from the hook's initial
 *     snapshot (callers hand in the preferences blob they already fetched
 *     so the hook stays server-fetch-free).
 *   - `needsAnswer` is true when no entry exists OR when `expires_at` has
 *     elapsed.  `expires_at === null` marks a lifetime tag (never
 *     re-asked).
 *   - `record(value)` POSTs to `/api/preferences` with a fully-structured
 *     tag entry ({ value, answered_at, expires_at }).  Server is
 *     responsible for deep-merging + recomputing percentages.
 *   - `skip()` writes a short-expiry soft-skip entry (24h) so the egg
 *     won't re-surface within the same session.
 *
 * Kept deliberately tiny — all orchestration lives in EasterEggOrchestrator.
 */

import { useCallback, useState } from "react";
import type { PreferenceTag, Preferences } from "@/types/db";

export type UseEasterEggOptions = {
  /** Days until the answer expires.  `null` = never expires (lifetime). */
  expiryDays: number | null;
};

export type UseEasterEggResult<T = unknown> = {
  /** True when the user hasn't answered (or the answer has expired). */
  needsAnswer: boolean;
  /** Current stored value, or null. */
  answer: T | null;
  /** Persist a new answer with the configured expiry. */
  record: (value: T) => Promise<void>;
  /** Record a 24h soft-skip so the prompt won't re-fire this session. */
  skip: () => Promise<void>;
  /** In-flight save indicator (useful for disabling buttons). */
  saving: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isExpired(tag: PreferenceTag | undefined, nowIso: string): boolean {
  if (!tag) return true;
  if (tag.expires_at === null) return false;
  return tag.expires_at < nowIso;
}

export function useEasterEgg<T = unknown>(
  tagKey: string,
  initialPreferences: Preferences | null | undefined,
  options: UseEasterEggOptions
): UseEasterEggResult<T> {
  const [tag, setTag] = useState<PreferenceTag | undefined>(
    () => initialPreferences?.tags?.[tagKey]
  );
  const [saving, setSaving] = useState(false);
  const nowIso = new Date().toISOString();
  const needsAnswer = isExpired(tag, nowIso);

  const persist = useCallback(
    async (entry: PreferenceTag) => {
      setSaving(true);
      try {
        const res = await fetch("/api/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: { [tagKey]: entry } }),
        });
        if (res.ok) setTag(entry);
      } catch (err) {
        // Easter eggs are opt-in; failing silently is fine.  Log for ops.
        console.warn("[useEasterEgg] save failed", tagKey, err);
      } finally {
        setSaving(false);
      }
    },
    [tagKey]
  );

  const record = useCallback(
    async (value: T) => {
      const answeredAt = new Date();
      const expiresAt =
        options.expiryDays === null
          ? null
          : new Date(answeredAt.getTime() + options.expiryDays * DAY_MS).toISOString();
      await persist({
        value,
        answered_at: answeredAt.toISOString(),
        expires_at: expiresAt,
      });
    },
    [options.expiryDays, persist]
  );

  const skip = useCallback(async () => {
    const answeredAt = new Date();
    await persist({
      value: "__skipped__",
      answered_at: answeredAt.toISOString(),
      // 24h soft-expiry — re-surfaces tomorrow rather than this session.
      expires_at: new Date(answeredAt.getTime() + DAY_MS).toISOString(),
    });
  }, [persist]);

  return {
    needsAnswer,
    answer: (tag?.value as T) ?? null,
    record,
    skip,
    saving,
  };
}
