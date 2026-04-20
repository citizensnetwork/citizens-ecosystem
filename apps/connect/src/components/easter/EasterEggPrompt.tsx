"use client";

/**
 * EasterEggPrompt — glass-panel prompt with 2–4 option pills.
 *
 * Generic across every Easter egg in the registry: the caller hands in a
 * short headline + option list + a handler.  We render the frosted overlay,
 * animate the selection, and hand the raw `value` back to the caller.
 *
 * Intentionally stateless beyond the "pending pick" pulse — persistence and
 * orchestration belong upstream (see `EasterEggOrchestrator`).
 */

import { useEffect, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export type EasterEggOption<T = unknown> = {
  label: string;
  emoji?: string;
  value: T;
};

type Props<T = unknown> = {
  /** Short headline, e.g. "Would you rather..." or "Quick one —". */
  headline: string;
  /** Main question text. */
  question: string;
  /** 2–4 options.  Rendered as side-by-side pills on sm+, stacked on mobile. */
  options: EasterEggOption<T>[];
  /** Called with the chosen option's `value` when the user picks. */
  onPick: (value: T) => void;
  /** Called when the user taps "Skip for now" or the X. */
  onSkip: () => void;
  /** Optional step indicator (e.g. "1 / 6") for multi-step flows. */
  step?: string;
  /** Optional footer microcopy — defaults to a reassuring line. */
  footer?: string;
  /** Disable all inputs (parent is saving). */
  busy?: boolean;
};

export default function EasterEggPrompt<T = unknown>({
  headline,
  question,
  options,
  onPick,
  onSkip,
  step,
  footer = "Helps us surface the right things — change anytime in your profile.",
  busy = false,
}: Props<T>) {
  const [pending, setPending] = useState<number | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(true);

  // Reset the "pending" pulse whenever the options list changes identity —
  // e.g. the parent advanced to the next question in a multi-step flow.
  // Without this reset, `pending !== null` would block every click after
  // the first one since the component instance is reused between steps.
  useEffect(() => {
    setPending(null);
  }, [options]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onSkip]);

  function pick(index: number) {
    if (pending !== null || busy) return;
    setPending(index);
    // Brief delay so the selection animates before the parent unmounts.
    window.setTimeout(() => {
      onPick(options[index].value);
    }, 220);
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={question}
      className="fixed inset-0 z-9999 flex items-center justify-center px-4"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" aria-hidden />

      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        {step && (
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white tabular-nums backdrop-blur">
            {step}
          </span>
        )}
        <button
          type="button"
          onClick={onSkip}
          aria-label="Skip for now"
          disabled={busy}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 disabled:opacity-50"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-white/30 bg-white/15 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
          {headline}
        </p>
        <p className="mt-2 text-center text-lg font-semibold text-white sm:text-xl">
          {question}
        </p>

        <div
          className={`mt-6 grid gap-3 ${
            options.length >= 3
              ? "grid-cols-1 sm:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-2"
          }`}
        >
          {options.map((opt, i) => {
            const selected = pending === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => pick(i)}
                disabled={pending !== null || busy}
                className={`group relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-5 text-center transition-all ${
                  selected
                    ? "scale-[1.02] border-(--gold) bg-(--gold) text-black shadow-lg"
                    : "border-white/40 bg-white/20 text-white hover:border-white/70 hover:bg-white/30"
                } disabled:cursor-default`}
              >
                {opt.emoji && (
                  <span className="text-3xl" aria-hidden>
                    {opt.emoji}
                  </span>
                )}
                <span className="text-base font-semibold">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="mt-5 block w-full text-center text-sm text-white/70 underline decoration-white/30 underline-offset-4 hover:text-white disabled:opacity-50"
        >
          Skip for now
        </button>

        <p className="mt-3 text-center text-[11px] text-white/70">{footer}</p>
      </div>
    </div>
  );
}
