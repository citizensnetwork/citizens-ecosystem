"use client";

/**
 * PreferencePicker — a "Would You Rather" glass overlay that surfaces a few
 * lightweight, fun preference questions after a citizen first lands on the
 * map.  The answers are stored in `profiles.preferences.wyr` and inform
 * downstream personalisation (event ranking, AI search prompts, etc.) without
 * gating any features on completion.
 *
 * Design intent (from the brief):
 *   - Full-screen frosted-glass panel, not a modal-with-backdrop.
 *   - VSCode-style "1 / n" indicator in the top-right corner.
 *   - Two options side-by-side (left vs right).  Tapping either auto-advances
 *     to the next question — no "Next" button required.
 *   - Persistent close (X) so the user can dismiss at any time.  We treat any
 *     dismiss the same as "skip" — the picker can be re-surfaced from
 *     settings later.
 *   - Questions are framed as broad vibe scales rather than identity labels
 *     so they read fun, not invasive (e.g. "Action & adventure vibes" vs
 *     "Creative & nurturing vibes" instead of "tomboyish vs feminine").
 *
 * Persistence:
 *   - Each completed answer is POSTed to /api/preferences (server-side
 *     deep-merge into the wyr slice).  We send one request per answer rather
 *     than batching at the end so a partial run still saves progress.
 *   - A localStorage flag (`cc_wyr_done_v1`) prevents re-prompting the user
 *     once they've finished or skipped.  Versioned so we can roll a new
 *     question pool later without forcing a re-prompt.
 */

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * Question pool.  Order doesn't matter — we present them as authored.
 *
 * Conventions:
 *   - `id` is the persisted key in profiles.preferences.wyr.  Never rename
 *     an existing id; add a new question + retire the old one instead so
 *     historical data keeps its meaning.
 *   - `left` / `right` are the user-facing labels.  Keep them parallel in
 *     length and tone so neither side feels "default".
 *   - Optional `emoji` adds warmth without leaning on imagery.
 */
type Question = {
  id: string;
  left: { label: string; emoji?: string };
  right: { label: string; emoji?: string };
};

const QUESTIONS: Question[] = [
  {
    id: "crowd_size",
    left: { label: "Big crowds", emoji: "🎉" },
    right: { label: "Small groups", emoji: "🫶" },
  },
  {
    id: "planning",
    left: { label: "Plan ahead", emoji: "🗓️" },
    right: { label: "Spontaneous", emoji: "✨" },
  },
  {
    id: "setting",
    left: { label: "Outdoor adventures", emoji: "🌿" },
    right: { label: "Cozy gatherings", emoji: "🛋️" },
  },
  {
    id: "worship_vibe",
    left: { label: "Loud worship", emoji: "🎤" },
    right: { label: "Quiet reflection", emoji: "🕯️" },
  },
  {
    id: "depth",
    left: { label: "Deep one-on-ones", emoji: "☕" },
    right: { label: "Group conversations", emoji: "💬" },
  },
  {
    id: "vibe",
    // Reframed gender-style question per the brief: vibe pairs rather than
    // identity labels.  Either side is equally valid for any gender.
    left: { label: "Action & adventure vibes", emoji: "⛰️" },
    right: { label: "Creative & nurturing vibes", emoji: "🎨" },
  },
  {
    id: "time_of_day",
    left: { label: "Mornings", emoji: "🌅" },
    right: { label: "Evenings", emoji: "🌙" },
  },
  {
    id: "social_familiarity",
    left: { label: "New faces", emoji: "👋" },
    right: { label: "Familiar friends", emoji: "🤝" },
  },
];

const STORAGE_KEY = "cc_wyr_done_v1";

type Props = {
  /** When true, the picker is mounted; the parent controls visibility. */
  open: boolean;
  /** Called whenever the user dismisses or completes — parent should hide. */
  onClose: () => void;
};

export default function PreferencePicker({ open, onClose }: Props) {
  const [index, setIndex] = useState(0);
  // Track the most recent click so we can show a brief "selected" pulse
  // before the auto-advance.  This makes the auto-advance feel intentional
  // rather than jarring.
  const [pendingPick, setPendingPick] = useState<"left" | "right" | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  // Hold the in-flight POST count so we can avoid closing the overlay until
  // the final answer has been queued (the request itself can complete in
  // the background, but we want to be sure it was issued).
  const inFlightRef = useRef(0);

  // Reset progress whenever the picker is re-opened so a future "open from
  // settings" path can re-run without code changes here.
  useEffect(() => {
    if (open) {
      setIndex(0);
      setPendingPick(null);
    }
  }, [open]);

  // ESC dismisses the same way the X button does.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleSkip();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // handleSkip is stable enough — re-binding on every render is cheap and
    // avoids a missing-dep lint warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const question = QUESTIONS[index];
  const total = QUESTIONS.length;
  const isLast = index === total - 1;

  function persistAnswer(qid: string, choice: "left" | "right") {
    // Fire-and-forget; failures are non-critical (the picker is opt-in and
    // can be re-run).  We log so we'd notice in production logs.
    inFlightRef.current += 1;
    void fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wyr: { [qid]: choice } }),
    })
      .catch((err) => {
        console.warn("[PreferencePicker] save failed", err);
      })
      .finally(() => {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
      });
  }

  function handlePick(choice: "left" | "right") {
    if (pendingPick) return; // ignore double-taps mid-transition
    setPendingPick(choice);
    persistAnswer(question.id, choice);

    // Brief delay so the user sees the selection light up before we
    // advance.  Keep it short enough to feel snappy.
    window.setTimeout(() => {
      if (isLast) {
        markDoneAndClose();
      } else {
        setIndex((i) => i + 1);
        setPendingPick(null);
      }
    }, 220);
  }

  function markDoneAndClose() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Private browsing / quota errors are fine — we just won't suppress the
      // picker on next visit.  No user-facing impact.
    }
    onClose();
  }

  /** "Skip" and "X" are the same action — bail out without re-prompting. */
  function handleSkip() {
    markDoneAndClose();
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Quick preference picker"
      className="fixed inset-0 z-9999 flex items-center justify-center px-4"
    >
      {/* Frosted backdrop.  We render the blur on a dedicated layer rather
          than the dialog so the dialog itself can fade independently if we
          add transitions later. */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" aria-hidden />

      {/* Step counter, top-right (VSCode-style "1 / n").  Sits on the
          backdrop layer rather than inside the card so it stays anchored
          to the viewport corner regardless of card size. */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white tabular-nums backdrop-blur">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={handleSkip}
          aria-label="Close preference picker"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Glass card — capped width so the two options sit comfortably
          side-by-side on tablet/desktop and stack readably on phones. */}
      <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-white/30 bg-white/15 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
          Would you rather…
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["left", "right"] as const).map((side) => {
            const opt = question[side];
            const selected = pendingPick === side;
            return (
              <button
                key={side}
                type="button"
                onClick={() => handlePick(side)}
                disabled={pendingPick !== null}
                className={`group relative flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-6 text-center transition-all sm:min-h-44 ${
                  selected
                    ? "scale-[1.02] border-(--gold) bg-(--gold) text-black shadow-lg"
                    : "border-white/40 bg-white/20 text-white hover:border-white/70 hover:bg-white/30"
                } disabled:cursor-default`}
              >
                {opt.emoji && (
                  <span className="text-3xl sm:text-4xl" aria-hidden>
                    {opt.emoji}
                  </span>
                )}
                <span className="text-base font-semibold sm:text-lg">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Progress dots — purely decorative; the numeric indicator above
            is the source of truth.  Dots double as a quick "you're almost
            done" signal at a glance. */}
        <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden>
          {QUESTIONS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i < index
                  ? "w-4 bg-(--gold)"
                  : i === index
                  ? "w-6 bg-white"
                  : "w-1.5 bg-white/30"
              }`}
            />
          ))}
        </div>

        <p className="mt-4 text-center text-[11px] text-white/70">
          Helps us surface the right kind of gatherings — change anytime in your profile.
        </p>
      </div>
    </div>
  );
}

/**
 * Returns true when the picker has not yet been completed/skipped on this
 * device.  Callers should additionally gate on auth status & onboarding
 * completion so the picker doesn't fight other first-run UIs for attention.
 */
export function shouldShowPreferencePicker(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "1";
  } catch {
    // No localStorage (private mode / SSR fallback): default to NOT showing
    // so we never accidentally repeat-prompt every navigation.
    return false;
  }
}
