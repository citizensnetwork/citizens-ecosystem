"use client";

/**
 * LongFormPersonalizationSheet — "Rainbow ?" voluntary deep-dive sheet.
 *
 * The Easter-egg system collects preferences organically through tiny
 * in-context prompts.  Some users want to get it over with in one go —
 * this sheet is their entry point.  It lists every registry question
 * the user hasn't answered yet (or whose answer has expired) and posts
 * them all in a single request on save.
 *
 * Design rules:
 *   - Slogan lives at the TOP of the sheet as a reminder of why we ask.
 *   - Every field is optional — "Save what I've picked" always works.
 *   - Picks are held in local state and flushed in one request (mirrors
 *     the quiz fix — no per-click network round-trips).
 */

import { useEffect, useMemo, useState } from "react";
import type { Preferences, PreferenceTag } from "@/types/db";
import { useFocusTrap } from "@/hooks/useFocusTrap";

type Props = {
  prefs?: Preferences;
  onClose: () => void;
  onSaved?: (next: Preferences) => void;
};

type Question = {
  tagKey: string;
  headline: string;
  expiryDays: number | null;
  options: { label: string; emoji: string; value: string }[];
};

/** Mirror of the registry copy but flat — this is the full menu of asks. */
const QUESTIONS: Question[] = [
  {
    tagKey: "gender",
    headline: "Which side fits you?",
    expiryDays: null,
    options: [
      { label: "Male", emoji: "♂️", value: "male" },
      { label: "Female", emoji: "♀️", value: "female" },
      { label: "Prefer not to say", emoji: "🤝", value: "prefer_not_to_say" },
    ],
  },
  {
    tagKey: "relationship_stance",
    headline: "Where are you at relationally?",
    expiryDays: 365,
    options: [
      { label: "Single", emoji: "🙋", value: "single" },
      { label: "Dating", emoji: "💞", value: "dating" },
      { label: "Engaged", emoji: "💍", value: "engaged" },
      { label: "Married", emoji: "💒", value: "married" },
    ],
  },
  {
    tagKey: "stage_of_life",
    headline: "Which word fits the season you're in?",
    expiryDays: 365,
    options: [
      { label: "Seeking", emoji: "🧭", value: "seeking" },
      { label: "Growing", emoji: "🌱", value: "growing" },
      { label: "Serving", emoji: "🤲", value: "serving" },
      { label: "Leading", emoji: "⭐", value: "leading" },
    ],
  },
  {
    tagKey: "love_language",
    headline: "What fills your cup most?",
    expiryDays: 365,
    options: [
      { label: "Words", emoji: "💬", value: "words" },
      { label: "Service", emoji: "🤲", value: "service" },
      { label: "Gifts", emoji: "🎁", value: "gifts" },
      { label: "Time", emoji: "⏳", value: "time" },
      { label: "Touch", emoji: "🫂", value: "touch" },
    ],
  },
  {
    tagKey: "time_availability",
    headline: "When can you actually go out?",
    expiryDays: 180,
    options: [
      { label: "Weekday evenings", emoji: "🌆", value: "weekday_evenings" },
      { label: "Weekends", emoji: "☀️", value: "weekends" },
      { label: "Both, usually", emoji: "✨", value: "both" },
    ],
  },
  {
    tagKey: "leadership_interest",
    headline: "Could you see yourself helping lead something here?",
    expiryDays: 365,
    options: [
      { label: "Yes, intrigued", emoji: "⭐", value: "yes" },
      { label: "Maybe later", emoji: "🤔", value: "maybe" },
      { label: "Not my thing", emoji: "🙅", value: "no" },
    ],
  },
];

export default function LongFormPersonalizationSheet({ prefs, onClose, onSaved }: Props) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Pre-populate local state from the user's existing (non-expired) answers
  // so they can see + edit what we already know.
  useEffect(() => {
    if (!prefs) return;
    const seed: Record<string, string> = {};
    for (const q of QUESTIONS) {
      const tag = prefs.tags?.[q.tagKey];
      if (tag && typeof tag.value === "string" && tag.value !== "__skipped__") {
        seed[q.tagKey] = tag.value;
      }
    }
    setPicks(seed);
  }, [prefs]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const answeredCount = useMemo(() => Object.keys(picks).length, [picks]);
  const DAY_MS = 24 * 60 * 60 * 1000;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const answeredAt = new Date();
      const tags: Record<string, PreferenceTag> = {};
      for (const q of QUESTIONS) {
        const v = picks[q.tagKey];
        if (!v) continue;
        tags[q.tagKey] = {
          value: v,
          answered_at: answeredAt.toISOString(),
          expires_at:
            q.expiryDays === null
              ? null
              : new Date(answeredAt.getTime() + q.expiryDays * DAY_MS).toISOString(),
        };
      }
      // Stamp the "last_longform_asked_at" marker so the button can
      // throttle re-surfacing on the map.
      const body: {
        tags: Record<string, PreferenceTag>;
        last_longform_asked_at: string;
        leadership_interest?: boolean | null;
      } = {
        tags,
        last_longform_asked_at: answeredAt.toISOString(),
      };
      // If they answered leadership_interest, cache the boolean at the
      // top level of preferences so the trigger predicate sees it.
      if (picks.leadership_interest === "yes") body.leadership_interest = true;
      else if (picks.leadership_interest === "no") body.leadership_interest = false;

      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        onSaved?.({
          ...(prefs ?? {}),
          tags: { ...(prefs?.tags ?? {}), ...tags },
          last_longform_asked_at: answeredAt.toISOString(),
          ...(typeof body.leadership_interest === "boolean"
            ? { leadership_interest: body.leadership_interest }
            : {}),
          ...(json?.preferences?.percentages
            ? { percentages: json.preferences.percentages }
            : {}),
        });
      }
    } catch (err) {
      console.warn("[LongFormPersonalizationSheet] save failed", err);
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Personalise your Citizens Connect"
      className="fixed inset-0 z-9999 flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* ── Header with slogan (per plan — slogan at top of long-form sheet) */}
        <div className="border-b border-black/5 bg-white px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium leading-tight text-black/80">
                Citizens Connect helps{" "}
                <span className="text-(--gold) font-semibold">YOU</span> find{" "}
                <span className="text-(--gold) font-semibold">YOUR</span> place in the Kingdom.
              </p>
              <h2 className="mt-2 text-lg font-semibold">Tell us about you</h2>
              <p className="mt-1 text-xs text-black/60">
                Every answer is optional. Skip any question and save when you&apos;re ready.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-black/60 transition hover:bg-black/10"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Questions ── */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {QUESTIONS.map((q) => (
            <section key={q.tagKey}>
              <h3 className="text-sm font-semibold text-black/80">{q.headline}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const active = picks[q.tagKey] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setPicks((p) => {
                          const next = { ...p };
                          if (active) delete next[q.tagKey];
                          else next[q.tagKey] = opt.value;
                          return next;
                        })
                      }
                      className={
                        active
                          ? "flex items-center gap-1.5 rounded-full border border-(--gold) bg-(--gold)/15 px-3 py-1.5 text-sm font-medium text-black transition active:scale-95"
                          : "flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm text-black/75 transition hover:bg-black/5 active:scale-95"
                      }
                      aria-pressed={active}
                    >
                      <span aria-hidden="true">{opt.emoji}</span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* ── Save footer ── */}
        <div className="border-t border-black/5 bg-white px-5 py-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-(--gold) px-4 py-2.5 text-sm font-semibold text-black shadow-md transition active:scale-95 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : answeredCount > 0
                ? `Save ${answeredCount} answer${answeredCount === 1 ? "" : "s"}`
                : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
