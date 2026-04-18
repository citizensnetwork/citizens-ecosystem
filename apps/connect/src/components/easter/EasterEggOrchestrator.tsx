"use client";

/**
 * EasterEggOrchestrator — single mount point on `/events` that watches the
 * registry and fires one prompt at a time when a trigger lights up.
 *
 * Contract:
 *   - Parent passes the current user's preferences (fetched server-side on
 *     page load) plus a few ambient context bits we can't know from here.
 *   - We maintain session-only state (map-entry count, tapped-category set,
 *     contributor-action flag) in refs + localStorage so we never show the
 *     same egg twice in one session unless the trigger genuinely re-fires.
 *   - Persistence happens via `useEasterEgg`; once the user answers, we
 *     re-evaluate the registry and surface the next egg (if any).
 *
 * The orchestrator deliberately handles only WYR and the always-soft eggs
 * (love language, season, time availability, gender bucket) in this pass.
 * Category-tap-driven eggs (couples, gender refinement) and the leadership
 * egg are wired by the map + event-detail surfaces in Commit 2.
 */

import { useEffect, useMemo, useState } from "react";
import type { Preferences, PreferenceTag } from "@/types/db";
import { EASTER_EGGS } from "@/lib/easterEggs/registry";
import { sampleWyrBatch, type WyrQuestion, type WyrSide } from "@/lib/easterEggs/wyr";
import EasterEggPrompt, { type EasterEggOption } from "./EasterEggPrompt";
import { useEasterEgg } from "@/hooks/useEasterEgg";

type Props = {
  userId: string;
  initialPreferences: Preferences | null;
  accountCreatedAt: string;
  /** Hidden when false — used to suppress prompts on shared/anonymous views. */
  enabled?: boolean;
};

const SESSION_ENTRY_KEY = "cc_egg_map_entries_v1";
const SESSION_DISMISS_KEY = "cc_egg_dismissed_v1";

/** Read session-only map-entry count so triggers scale with repeat visits. */
function bumpMapEntryCount(): number {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.sessionStorage.getItem(SESSION_ENTRY_KEY);
    const current = raw ? parseInt(raw, 10) || 0 : 0;
    const next = current + 1;
    window.sessionStorage.setItem(SESSION_ENTRY_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(SESSION_DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markDismissed(id: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = readDismissed();
    existing.add(id);
    window.sessionStorage.setItem(
      SESSION_DISMISS_KEY,
      JSON.stringify([...existing])
    );
  } catch {
    /* noop */
  }
}

export default function EasterEggOrchestrator({
  initialPreferences,
  accountCreatedAt,
  enabled = true,
  userId,
}: Props) {
  const [mapEntryCount, setMapEntryCount] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<Preferences>(initialPreferences ?? {});

  // Snapshot map entries once per mount — don't tick this up on hot-reload.
  useEffect(() => {
    setMapEntryCount(bumpMapEntryCount());
    setDismissed(readDismissed());
  }, []);

  // Pick the first egg whose trigger fires AND that hasn't been dismissed
  // this session.  Evaluated lazily so answering one egg can promote the next.
  const activeEgg = useMemo(() => {
    if (!enabled || mapEntryCount === 0) return null;
    const ctx = {
      mapEntryCount,
      tappedEventCategories: new Set<string>(),
      hasLeadershipInterest: prefs.leadership_interest === true,
      contributorActionAttempted: false,
      nowIso: new Date().toISOString(),
      accountCreatedAtIso: accountCreatedAt,
    };
    for (const egg of EASTER_EGGS) {
      if (dismissed.has(egg.id)) continue;
      const existing: PreferenceTag | undefined = prefs.tags?.[egg.tagKey];
      if (egg.shouldFire(ctx, existing)) return egg;
    }
    return null;
  }, [enabled, mapEntryCount, dismissed, prefs, accountCreatedAt]);

  if (!activeEgg) return null;

  switch (activeEgg.id) {
    case "wyr_pool":
      return (
        <WyrPromptFlow
          userId={userId}
          prefs={prefs}
          onAdvancePrefs={setPrefs}
          onFinish={() => {
            markDismissed("wyr_pool");
            setDismissed((s) => new Set([...s, "wyr_pool"]));
          }}
        />
      );
    case "love_language":
      return (
        <SingleTagPrompt
          headline="Quick one —"
          question="What fills your cup most?"
          tagKey="love_language"
          expiryDays={365}
          options={[
            { label: "Words", emoji: "💬", value: "words" },
            { label: "Service", emoji: "🤲", value: "service" },
            { label: "Gifts", emoji: "🎁", value: "gifts" },
            { label: "Time", emoji: "⏳", value: "time" },
            { label: "Touch", emoji: "🫂", value: "touch" },
          ]}
          prefs={prefs}
          onDone={(next) => {
            setPrefs(next);
            markDismissed("love_language");
            setDismissed((s) => new Set([...s, "love_language"]));
          }}
          onSkip={() => {
            markDismissed("love_language");
            setDismissed((s) => new Set([...s, "love_language"]));
          }}
        />
      );
    case "stage_of_life":
      return (
        <SingleTagPrompt
          headline="Where are you right now?"
          question="Which word fits the season you're in?"
          tagKey="stage_of_life"
          expiryDays={365}
          options={[
            { label: "Seeking", emoji: "🧭", value: "seeking" },
            { label: "Growing", emoji: "🌱", value: "growing" },
            { label: "Serving", emoji: "🤲", value: "serving" },
            { label: "Leading", emoji: "⭐", value: "leading" },
          ]}
          prefs={prefs}
          onDone={(next) => {
            setPrefs(next);
            markDismissed("stage_of_life");
            setDismissed((s) => new Set([...s, "stage_of_life"]));
          }}
          onSkip={() => {
            markDismissed("stage_of_life");
            setDismissed((s) => new Set([...s, "stage_of_life"]));
          }}
        />
      );
    case "time_availability":
      return (
        <SingleTagPrompt
          headline="When do you usually show up?"
          question="When can you actually go out?"
          tagKey="time_availability"
          expiryDays={180}
          options={[
            { label: "Weekday evenings", emoji: "🌆", value: "weekday_evenings" },
            { label: "Weekends", emoji: "☀️", value: "weekends" },
            { label: "Both, usually", emoji: "✨", value: "both" },
          ]}
          prefs={prefs}
          onDone={(next) => {
            setPrefs(next);
            markDismissed("time_availability");
            setDismissed((s) => new Set([...s, "time_availability"]));
          }}
          onSkip={() => {
            markDismissed("time_availability");
            setDismissed((s) => new Set([...s, "time_availability"]));
          }}
        />
      );
    // The remaining eggs (gender, couples, leadership) are triggered by map
    // interactions in Commit 2 — not by the orchestrator's baseline triggers.
    default:
      return null;
  }
}

// ── WYR flow ─────────────────────────────────────────────────────

type WyrFlowProps = {
  userId: string;
  prefs: Preferences;
  onAdvancePrefs: (next: Preferences) => void;
  onFinish: () => void;
};

function WyrPromptFlow({ userId, prefs, onAdvancePrefs, onFinish }: WyrFlowProps) {
  const batch: WyrQuestion[] = useMemo(() => {
    const answered = (prefs.wyr ?? {}) as Record<string, WyrSide>;
    return sampleWyrBatch({ userId, answered, size: 3 });
    // We deliberately only re-sample when the user id changes; answering a
    // question inside the batch should NOT reshuffle the remaining questions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!batch.length) {
    // Nothing to ask — mark done and bail out.
    onFinish();
    return null;
  }

  const q = batch[index];

  async function persistPick(side: WyrSide) {
    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wyr: { [q.id]: side } }),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        const next: Preferences = {
          ...prefs,
          wyr: { ...(prefs.wyr ?? {}), [q.id]: side },
          ...(json?.preferences ? { percentages: json.preferences.percentages } : {}),
        };
        onAdvancePrefs(next);
      }
    } catch (err) {
      console.warn("[WyrPromptFlow] save failed", err);
    } finally {
      setSaving(false);
    }
    if (index + 1 >= batch.length) onFinish();
    else setIndex((i) => i + 1);
  }

  return (
    <EasterEggPrompt<WyrSide>
      headline="Would you rather…"
      question=""
      step={`${index + 1} / ${batch.length}`}
      options={[
        { label: q.left.label, emoji: q.left.emoji, value: "left" },
        { label: q.right.label, emoji: q.right.emoji, value: "right" },
      ]}
      onPick={(v) => void persistPick(v)}
      onSkip={onFinish}
      busy={saving}
    />
  );
}

// ── Single-tag helper ────────────────────────────────────────────

type SingleTagPromptProps<T> = {
  headline: string;
  question: string;
  tagKey: string;
  expiryDays: number | null;
  options: EasterEggOption<T>[];
  prefs: Preferences;
  onDone: (next: Preferences) => void;
  onSkip: () => void;
};

function SingleTagPrompt<T>({
  headline,
  question,
  tagKey,
  expiryDays,
  options,
  prefs,
  onDone,
  onSkip,
}: SingleTagPromptProps<T>) {
  const egg = useEasterEgg<T>(tagKey, prefs, { expiryDays });

  return (
    <EasterEggPrompt<T>
      headline={headline}
      question={question}
      options={options}
      busy={egg.saving}
      onPick={async (value) => {
        await egg.record(value);
        onDone({
          ...prefs,
          tags: {
            ...(prefs.tags ?? {}),
            [tagKey]: {
              value,
              answered_at: new Date().toISOString(),
              expires_at:
                expiryDays === null
                  ? null
                  : new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString(),
            },
          },
        });
      }}
      onSkip={async () => {
        await egg.skip();
        onSkip();
      }}
    />
  );
}
