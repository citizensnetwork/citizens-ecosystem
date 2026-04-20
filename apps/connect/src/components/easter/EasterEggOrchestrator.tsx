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
import { subscribeEasterEggBus } from "@/lib/easterEggs/bus";
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
  // Ambient trigger state fed by the bus — tapped categories + whether the
  // user has just tried a contributor action (e.g. tapped Create while not
  // yet opted-in for leadership).
  const [tappedCats, setTappedCats] = useState<Set<string>>(new Set());
  const [contributorAttempted, setContributorAttempted] = useState(false);

  // Snapshot map entries once per mount — don't tick this up on hot-reload.
  useEffect(() => {
    setMapEntryCount(bumpMapEntryCount());
    setDismissed(readDismissed());
  }, []);

  // Subscribe to the bus so map/detail interactions can light up triggers.
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeEasterEggBus((evt) => {
      if (evt.type === "category_tapped") {
        setTappedCats((prev) => {
          if (prev.has(evt.category)) return prev;
          const next = new Set(prev);
          next.add(evt.category);
          return next;
        });
      } else if (evt.type === "contributor_action_attempted") {
        setContributorAttempted(true);
      }
    });
    return unsub;
  }, [enabled]);

  // Pick the first egg whose trigger fires AND that hasn't been dismissed
  // this session.  Evaluated lazily so answering one egg can promote the next.
  const activeEgg = useMemo(() => {
    if (!enabled || mapEntryCount === 0) return null;
    const ctx = {
      mapEntryCount,
      tappedEventCategories: tappedCats,
      hasLeadershipInterest: prefs.leadership_interest === true,
      contributorActionAttempted: contributorAttempted,
      nowIso: new Date().toISOString(),
      accountCreatedAtIso: accountCreatedAt,
    };
    for (const egg of EASTER_EGGS) {
      if (dismissed.has(egg.id)) continue;
      const existing: PreferenceTag | undefined = prefs.tags?.[egg.tagKey];
      if (egg.shouldFire(ctx, existing)) return egg;
    }
    return null;
  }, [enabled, mapEntryCount, dismissed, prefs, accountCreatedAt, tappedCats, contributorAttempted]);

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
    case "relationship_stance":
      return (
        <SingleTagPrompt
          headline="Quick one —"
          question="What best describes where you're at?"
          tagKey="relationship_stance"
          expiryDays={365}
          options={[
            { label: "Single", emoji: "🙋", value: "single" },
            { label: "Dating", emoji: "💞", value: "dating" },
            { label: "Engaged", emoji: "💍", value: "engaged" },
            { label: "Married", emoji: "💒", value: "married" },
          ]}
          prefs={prefs}
          onDone={(next) => {
            setPrefs(next);
            markDismissed("relationship_stance");
            setDismissed((s) => new Set([...s, "relationship_stance"]));
          }}
          onSkip={() => {
            markDismissed("relationship_stance");
            setDismissed((s) => new Set([...s, "relationship_stance"]));
          }}
        />
      );
    case "gender":
      return (
        <SingleTagPrompt
          headline="Before we go on —"
          question="Which side fits you?"
          tagKey="gender"
          expiryDays={null}
          options={[
            { label: "Male", emoji: "♂️", value: "male" },
            { label: "Female", emoji: "♀️", value: "female" },
          ]}
          prefs={prefs}
          onDone={(next) => {
            setPrefs(next);
            markDismissed("gender");
            setDismissed((s) => new Set([...s, "gender"]));
          }}
          onSkip={() => {
            markDismissed("gender");
            setDismissed((s) => new Set([...s, "gender"]));
          }}
        />
      );
    case "leadership_interest":
      return (
        <SingleTagPrompt
          headline="A nudge —"
          question="Could you see yourself helping lead something in this community?"
          tagKey="leadership_interest"
          expiryDays={365}
          options={[
            { label: "Yes, intrigued", emoji: "⭐", value: "yes" },
            { label: "Maybe later", emoji: "🤔", value: "maybe" },
            { label: "Not my thing", emoji: "🙅", value: "no" },
          ]}
          prefs={prefs}
          onDone={(next) => {
            setPrefs({
              ...next,
              // When the user opts in, cache the leadership_interest flag at
              // the top level of `preferences` so the trigger predicate in
              // the registry can check it without reading the tag blob.
              leadership_interest: (
                next.tags?.leadership_interest?.value === "yes"
                  ? true
                  : next.tags?.leadership_interest?.value === "no"
                    ? false
                    : null
              ),
            });
            markDismissed("leadership_interest");
            setDismissed((s) => new Set([...s, "leadership_interest"]));
          }}
          onSkip={() => {
            markDismissed("leadership_interest");
            setDismissed((s) => new Set([...s, "leadership_interest"]));
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

/**
 * Multi-step "Would You Rather" flow.
 *
 * Design (per user feedback April 20):
 *   - All picks are held in local state and advance the step *immediately*
 *     — no network round-trip between questions.  This removes the delay +
 *     click-blocked bug that made the quiz feel broken.
 *   - A single POST to /api/preferences persists every answer + a
 *     `wyr_progress` soft-cooldown tag at the very end of the batch.
 *   - If the user dismisses the flow early (skip / Escape / overlay tap),
 *     we write a 48h soft-skip so the quiz does NOT re-surface on every
 *     login.  This is the fix for "it keeps popping up".
 */
function WyrPromptFlow({ userId, prefs, onAdvancePrefs, onFinish }: WyrFlowProps) {
  const batch: WyrQuestion[] = useMemo(() => {
    const answered = (prefs.wyr ?? {}) as Record<string, WyrSide>;
    return sampleWyrBatch({ userId, answered, size: 3 });
    // We deliberately only re-sample when the user id changes; answering a
    // question inside the batch should NOT reshuffle the remaining questions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const [index, setIndex] = useState(0);
  // Picks collected in-memory — persisted in one shot at the end.
  const [picks, setPicks] = useState<Record<string, WyrSide>>({});

  if (!batch.length) {
    // Nothing to ask — mark done and bail out.
    onFinish();
    return null;
  }

  const q = batch[index];

  /** Persist all collected picks + a cooldown tag, then close the flow. */
  async function flushAndFinish(finalPicks: Record<string, WyrSide>, completed: boolean) {
    const answeredAt = new Date();
    // 30-day cooldown if they completed the batch; 48h if they bailed
    // early.  Either way we stop re-surfacing on every login.
    const cooldownMs = completed ? 30 * 24 * 60 * 60 * 1000 : 48 * 60 * 60 * 1000;
    const progressTag = {
      value: completed ? "completed" : "skipped",
      answered_at: answeredAt.toISOString(),
      expires_at: new Date(answeredAt.getTime() + cooldownMs).toISOString(),
    };
    try {
      const hasPicks = Object.keys(finalPicks).length > 0;
      if (hasPicks || !completed) {
        const res = await fetch("/api/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wyr: finalPicks,
            tags: { wyr_progress: progressTag },
          }),
        });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const next: Preferences = {
            ...prefs,
            wyr: { ...(prefs.wyr ?? {}), ...finalPicks },
            tags: { ...(prefs.tags ?? {}), wyr_progress: progressTag },
            ...(json?.preferences?.percentages
              ? { percentages: json.preferences.percentages }
              : {}),
          };
          onAdvancePrefs(next);
        }
      }
    } catch (err) {
      console.warn("[WyrPromptFlow] save failed", err);
    }
    onFinish();
  }

  function recordPick(side: WyrSide) {
    const nextPicks = { ...picks, [q.id]: side };
    if (index + 1 >= batch.length) {
      // Last question — flush everything in one POST.
      void flushAndFinish(nextPicks, true);
    } else {
      setPicks(nextPicks);
      setIndex((i) => i + 1);
    }
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
      onPick={recordPick}
      onSkip={() => void flushAndFinish(picks, false)}
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
